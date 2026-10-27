// The stylesheet every story page is drawn with (lib/story/index.js), in a file of its own so the
// hand-design preview (app/StoryTemplateDesigner.jsx) shows a page with exactly the same CSS.
export const STORY_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1920px;font-family:'Inter','Vazirmatn',sans-serif}
.s{width:1080px;height:1920px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:260px 70px 280px;direction:rtl;text-align:center}
h1{font-weight:800;line-height:1.45;font-size:var(--h,60px);color:var(--text);text-shadow:0 1px 3px rgba(0,0,0,.25);max-width:940px}
.shots{display:flex;flex-direction:column;gap:12px;width:940px;margin-top:44px}
.shots img{display:block;width:100%;height:auto;border-radius:18px;object-fit:contain;background:#fff;border:2px solid var(--edge)}
.shots img.mast{max-height:230px;object-fit:cover;object-position:top}
.shots img.shot{max-height:820px}
.body{margin-top:44px;font-weight:800;font-size:var(--b,50px);line-height:1.5;max-width:940px}
.body span{background:var(--box);color:var(--boxText);padding:12px 26px;border-radius:16px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.ref{margin-top:34px;direction:ltr;color:var(--text);font-family:'Inter',sans-serif;font-weight:700;font-size:30px;opacity:.9;max-width:940px}
`;
