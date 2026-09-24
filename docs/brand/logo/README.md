# MarkFix Logo and theme

MarkFix belongs to the CarryOn visual family. Its selected ribbon M uses the same rounded 14-unit stroke and transparent 22-unit overlap cutout as CarryOn's ribbon C. The front/right ribbon and the Fix wordmark use theme purple (#7357D9). The back/left ribbon and Mark remain black on light backgrounds and white on dark backgrounds. The monochrome variant remains all black. No gradients or accent dots are part of the mark.

## Sources

- `packages/ui/src/components/markfix-logo.tsx` provides the shared React symbol and wordmarks. Each instance has a unique mask ID.
- `packages/ui/src/styles.css` owns the shared theme: purple primary actions and focus rings, white surfaces, zinc-gray backgrounds and borders; 10 px controls, 14 px menus and 16 px cards. Its neutral foundation and font stack follow CarryOn's `web/src/index.css`.
- `markfix-logo-icon.svg` is the white-and-purple ribbon M on a black rounded tile, shared with the website favicon source, desktop public favicon, and macOS icon generator. The website references its source asset with `?no-inline` so Vite emits a content-hashed URL; replacing the artwork also changes its cache key.
- `markfix-logo-horizontal.svg`, `markfix-logo-stacked.svg`, `markfix-logo-monochrome.svg`, and `markfix-logo-reversed.svg` provide vector lockups. Existing `mf` filenames now refer to the selected mark as well.
- `concepts/` contains historical exploration, not application assets.

## Use

Keep at least 14 units of clear space around the 100-unit symbol. Prefer 24 px or larger for the standalone mark, and 120 px or larger for horizontal lockups. Use the reversed white-and-purple artwork on dark backgrounds. Do not stretch, rotate, add shadows, change the approved ribbon color placement or add gradients.

SVG wordmarks retain editable Helvetica Neue / Helvetica / Arial text. Convert text to outlines before exact cross-platform print delivery. When embedding static SVGs inline, prefix mask IDs per instance; ordinary image references are isolated.

Theme changes affect application chrome and controls. Error, warning and success colors retain their meaning. Website target content and persisted user annotation colors are independent of the application theme.
