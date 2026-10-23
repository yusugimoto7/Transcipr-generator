"use client";

// Sets the interface language before anything under it is drawn (see lib/i18n.js).
import { useEffect } from "react";
import { setLang } from "../lib/i18n";

export default function LangProvider({ lang, children }) {
  setLang(lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return children;
}
