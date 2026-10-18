// Tailwind for the shadcn/ui components (components/ui). Its global reset is off:
// the existing screens are styled by hand and must not change while they are moved
// over one by one. Colours come from the palette tokens in app/globals.css.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        border: "var(--line)",
        ink: "var(--text)",
        muted: "var(--text-2)",
        primary: { DEFAULT: "var(--orange)", deep: "var(--brand-deep)", soft: "var(--mint)" },
        cream: "var(--cream)",
        logo: "var(--logo-orange)",
      },
      borderRadius: { lg: "10px", md: "8px", sm: "6px" },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Vazirmatn", "system-ui", "sans-serif"],
        fa: ["Vazirmatn", "var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
