"use client";

// How the post will look on each network: close enough to judge length, cut-off and media shape.

import { Play } from "lucide-react";
import { NET, effectiveCaption, thumbOf } from "./channels";
import c from "./publishing.module.css";
import { L } from "../../lib/i18n";

const HANDLE = "sugimotovisa";

function Media({ media, shape }) {
  const thumb = thumbOf(media);
  if (!media || media.kind === "none") return null;
  const n = (media.items || []).length;
  return (
    <div className={`${c.pvMedia} ${c["pv_" + shape]}`}>
      {thumb ? <img src={thumb} alt="" onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
      {media.kind === "video" && <span className={c.play}><Play size={28} fill="currentColor" aria-hidden /></span>}
      {n > 1 && <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 99, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>1/{n}</span>}
    </div>
  );
}

function Text({ text, limit, more }) {
  const t = String(text || "");
  const cut = more && t.length > more ? t.slice(0, more) : t;
  return (
    <p className={c.pvText} dir="auto">
      {cut}
      {cut.length < t.length && <span className={c.more}>{L("… بیشتر", "… more")}</span>}
      {limit && t.length > limit && <span className={c.over}>{L(` (${t.length - limit} نویسه بیش از حد)`, ` (too long by ${t.length - limit})`)}</span>}
    </p>
  );
}

export function Preview({ card, network }) {
  const caption = effectiveCaption(card, network);
  const ch = (card.channels || {})[network] || {};
  if (network === "instagram")
    return (
      <div className={c.pvIG}>
        <div className={c.pvHead}>
          <span className={c.pvAvatar}>SV</span>
          <b>{HANDLE}</b>
        </div>
        <Media media={card.media} shape={ch.format === "post" ? "square" : "tall"} />
        <div className={c.pvIcons}>♡ 💬 ➤</div>
        <Text text={(caption ? HANDLE + " " : "") + caption} more={125} limit={NET.instagram.max} />
      </div>
    );
  if (network === "tiktok")
    return (
      <div className={c.pvTT}>
        <Media media={card.media} shape="tall" />
        <div className={c.pvOverlay}>
          <b>@{HANDLE}</b>
          <Text text={caption} more={90} limit={NET.tiktok.max} />
        </div>
      </div>
    );
  if (network === "youtube")
    return (
      <div className={c.pvYT}>
        <Media media={card.media} shape="wide" />
        <b className={c.pvTitle} dir="auto">
          {ch.title || card.title || L("عنوان ویدیو", "Video title")}
        </b>
        <span className={c.muted}>Sugimoto Visa</span>
        <Text text={caption} more={160} limit={NET.youtube.max} />
      </div>
    );
  if (network === "linkedin")
    return (
      <div className={c.pvLI}>
        <div className={c.pvHead}>
          <span className={c.pvAvatar} style={{ borderRadius: 4 }}>SV</span>
          <div>
            <b>Sugimoto Visa</b>
            <div className={c.muted}>{L("صفحهٔ شرکت · همین الان", "Company page · now")}</div>
          </div>
        </div>
        <Text text={caption} more={210} limit={NET.linkedin.max} />
        <Media media={card.media} shape="wide" />
        <div className={c.pvIcons}>{L("👍 پسند · 💬 نظر · ↗ بازنشر", "👍 Like · 💬 Comment · ↗ Repost")}</div>
      </div>
    );
  return (
    <div className={c.pvX}>
      <div className={c.pvHead}>
        <span className={c.pvAvatar}>SV</span>
        <div>
          <b>Sugimoto Visa</b> <span className={c.muted}>@{HANDLE}</span>
        </div>
      </div>
      <Text text={caption} limit={NET.x.max} />
      <Media media={card.media} shape="wide" />
    </div>
  );
}
