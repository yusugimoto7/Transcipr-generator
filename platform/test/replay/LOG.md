# Nightly replay log

One entry per night (newest first): how many past clients were replayed, by
type, what was fixed in the platform, and how many questions went to the firm.
No client data here: the repository is public. The per-client reports are in
the firm's Drive reports folder.

| Night | Clients (type) | Fixes | Questions for the firm |
|---|---|---|---|
| 2026-10-03 | 0 real clients — fictional-only night (`GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY` and the Drive folder variables not set); 1 new invented client (owp-outside, common-law, previously married) | Common-law applicants asked for IMM 5409 + proof of living together instead of a marriage certificate (12 types); replay setup installs tesseract with Persian (3 unit tests failed without it) | 1 (should a common-law declaration go out in a final file named "Marriage Certificate"?) |
