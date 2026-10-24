import { cookies } from "next/headers";
import { LANG_COOKIE, normLang } from "../../lib/i18n";

// The tab's title in the viewer's language, read from the request (L() would be shared by every
// visitor on the server).
export function generateMetadata() {
  const fa = normLang(cookies().get(LANG_COOKIE)?.value) === "fa";
  return { title: fa ? "تدوین ویدیو · Sugimoto" : "Video Editing · Sugimoto" };
}

export default function EditingLayout({ children }) {
  return children;
}
