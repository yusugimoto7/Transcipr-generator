"""Read-only Trello API client.

Only GETs are issued: nothing in this module can modify a Trello board.
"""

import logging
import time

import requests

log = logging.getLogger(__name__)

API = "https://api.trello.com/1"

# Trello allows 100 requests per 10 seconds per token. Stay under it.
MIN_INTERVAL = 0.12
MAX_RETRIES = 5


class TrelloError(RuntimeError):
    pass


class Trello:
    def __init__(self, key, token):
        if not key or not token:
            raise TrelloError("TRELLO_API_KEY and TRELLO_TOKEN must both be set.")
        self.key = key
        self.token = token
        self.session = requests.Session()
        self._last_call = 0.0

    # -- plumbing ----------------------------------------------------------

    def _throttle(self):
        wait = MIN_INTERVAL - (time.monotonic() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()

    def get(self, path, **params):
        params.setdefault("key", self.key)
        params.setdefault("token", self.token)
        url = f"{API}/{path.lstrip('/')}"
        for attempt in range(MAX_RETRIES):
            self._throttle()
            try:
                resp = self.session.get(url, params=params, timeout=60)
            except requests.RequestException as exc:
                if attempt == MAX_RETRIES - 1:
                    raise TrelloError(f"GET {path} failed: {exc}") from exc
                time.sleep(2**attempt)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt == MAX_RETRIES - 1:
                    raise TrelloError(f"GET {path} -> {resp.status_code}: {resp.text[:300]}")
                time.sleep(2**attempt)
                continue
            if resp.status_code == 401:
                raise TrelloError(
                    f"GET {path} -> 401 unauthorized. The token cannot read this "
                    "resource, or it expired."
                )
            if not resp.ok:
                raise TrelloError(f"GET {path} -> {resp.status_code}: {resp.text[:300]}")
            return resp.json()
        raise TrelloError(f"GET {path} exhausted retries")

    def auth_url(self):
        return (
            # 30 days: a 1-day token dies between the structure pass and the
            # attachment pass of a large migration.
            f"https://trello.com/1/authorize?expiration=30days&scope=read"
            f"&response_type=token&name=Odoo%20Migration&key={self.key}"
        )

    # -- reads -------------------------------------------------------------

    def my_boards(self):
        return self.get(
            "members/me/boards",
            fields="id,name,closed,url,dateLastActivity",
            filter="all",
        )

    def board(self, board_id):
        return self.get(f"boards/{board_id}", fields="id,name,desc,closed,url")

    def lists(self, board_id):
        """Open and archived lists, in board order."""
        return self.get(f"boards/{board_id}/lists", filter="all", fields="id,name,closed,pos")

    def labels(self, board_id):
        return self.get(f"boards/{board_id}/labels", fields="id,name,color", limit=1000)

    def members(self, board_id):
        return self.get(f"boards/{board_id}/members", fields="id,username,fullName")

    def custom_fields(self, board_id):
        """Custom field definitions, including dropdown options."""
        return self.get(f"boards/{board_id}/customFields")

    def cards(self, board_id):
        """Every card on the board, archived ones included, fully expanded."""
        cards = self.get(
            f"boards/{board_id}/cards/all",
            fields=(
                "id,name,desc,closed,due,dueComplete,idList,idLabels,idMembers,"
                "pos,shortUrl,dateLastActivity,idShort"
            ),
            attachments="true",
            attachment_fields="id,name,url,bytes,mimeType,isUpload,date",
            checklists="all",
            # No checklist_fields filter: it would strip the nested checkItems,
            # which are the whole point of pulling checklists.
            checkItem_fields="id,name,state,pos",
            checkItemStates="true",
            customFieldItems="true",
        )
        log.info("  fetched %d cards", len(cards))
        return cards

    def comments(self, board_id):
        """All comments on the board, oldest first, grouped by card id.

        Fetched board-wide and paginated rather than per-card: one request per
        1000 comments instead of one per card.
        """
        by_card = {}
        before = None
        total = 0
        while True:
            batch = self.get(
                f"boards/{board_id}/actions",
                filter="commentCard",
                limit=1000,
                before=before,
                memberCreator_fields="id,username,fullName",
            )
            if not batch:
                break
            for action in batch:
                card_id = (action.get("data") or {}).get("card", {}).get("id")
                if card_id:
                    by_card.setdefault(card_id, []).append(action)
            total += len(batch)
            if len(batch) < 1000:
                break
            before = batch[-1]["id"]
        for actions in by_card.values():
            actions.reverse()  # Trello returns newest first
        log.info("  fetched %d comments", total)
        return by_card

    def activity(self, board_id):
        """Card-level history worth keeping: creations and list moves."""
        by_card = {}
        before = None
        while True:
            batch = self.get(
                f"boards/{board_id}/actions",
                filter="createCard,copyCard,updateCard",
                limit=1000,
                before=before,
                memberCreator_fields="id,username,fullName",
            )
            if not batch:
                break
            for action in batch:
                data = action.get("data") or {}
                # updateCard fires for every edit; only list moves carry listAfter.
                if action["type"] == "updateCard" and "listAfter" not in data:
                    continue
                card_id = (data.get("card") or {}).get("id")
                if card_id:
                    by_card.setdefault(card_id, []).append(action)
            if len(batch) < 1000:
                break
            before = batch[-1]["id"]
        for actions in by_card.values():
            actions.reverse()
        log.info("  fetched %d history entries", sum(len(v) for v in by_card.values()))
        return by_card

    def download(self, url):
        """Download a Trello-hosted attachment.

        Trello file attachments are private: an unauthenticated GET returns 401.
        The key/token must be sent as an OAuth Authorization header — query
        parameters are not accepted on this host.
        """
        headers = {
            "Authorization": f'OAuth oauth_consumer_key="{self.key}", oauth_token="{self.token}"'
        }
        for attempt in range(MAX_RETRIES):
            self._throttle()
            try:
                resp = self.session.get(url, headers=headers, timeout=180)
            except requests.RequestException as exc:
                if attempt == MAX_RETRIES - 1:
                    raise TrelloError(f"download {url} failed: {exc}") from exc
                time.sleep(2**attempt)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt == MAX_RETRIES - 1:
                    raise TrelloError(f"download {url} -> {resp.status_code}")
                time.sleep(2**attempt)
                continue
            if not resp.ok:
                raise TrelloError(f"download {url} -> {resp.status_code}")
            return resp.content
        raise TrelloError(f"download {url} exhausted retries")
