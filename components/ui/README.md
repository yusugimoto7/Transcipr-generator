# components/ui

The app's shared building blocks, adapted from shadcn/ui (MIT, https://ui.shadcn.com,
© shadcn). Every part of the app (Topic Engine, Calendar, Video Editing) uses these
instead of hand-styled buttons, so the screens look like one product.

- Colours come from the palette tokens in `app/globals.css` through `tailwind.config.js`
  (`bg-primary`, `text-muted`, `border-border`, …). Never hard-code a colour here.
- Tailwind's global reset is off while old screens are moved over, so components set
  what the reset would have given them (`border-solid`, `font-[inherit]`, `m-0`).
- Plain JSX (the app is not TypeScript).
