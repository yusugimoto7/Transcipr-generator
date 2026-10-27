// The app on a phone's home screen (Hamed, Oct 27 2026): opened from the icon it runs full screen
// and can receive notifications (public/sw.js, lib/push). iPhones need it added from Safari's Share
// menu; iOS sends web notifications only to such home-screen apps.
export default function manifest() {
  return {
    name: "Sugimoto Visa · Topic Engine",
    short_name: "Sugimoto",
    description: "Topics, content, calendar and Video Editing for the Sugimoto Visa team",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#243b44",
    theme_color: "#243b44",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
