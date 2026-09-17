# MarkFix Logo and theme

MarkFix belongs to the CarryOn visual family. Its selected ribbon M uses the same rounded 14-unit stroke and transparent 22-unit overlap cutout as CarryOn's ribbon C. Primary artwork is black; reversed artwork is white. No gradients or accent dots are part of the mark.

## Sources

- `packages/ui/src/components/markfix-logo.tsx` provides the shared React symbol and wordmarks. Each instance has a unique mask ID.
- `packages/ui/src/styles.css` owns the shared theme: dark primary actions, white surfaces, zinc-gray backgrounds, borders and focus rings; 10 px controls, 14 px menus and 16 px cards. Its palette and font stack match CarryOn's `web/src/index.css`.
- `markfix-logo-icon.svg` is the white ribbon M on a black rounded tile, shared with both public favicon assets and the macOS icon generator.
- `markfix-logo-horizontal.svg`, `markfix-logo-stacked.svg`, `markfix-logo-monochrome.svg`, and `markfix-logo-reversed.svg` provide vector lockups. Existing `mf` filenames now refer to the selected mark as well.
- `concepts/` contains historical exploration, not application assets.

## Use

Keep at least 14 units of clear space around the 100-unit symbol. Prefer 24 px or larger for the standalone mark, and 120 px or larger for horizontal lockups. Use white artwork on dark backgrounds. Do not stretch, rotate, add shadows, recolor individual strokes or restore the previous violet gradient.

SVG wordmarks retain editable Helvetica Neue / Helvetica / Arial text. Convert text to outlines before exact cross-platform print delivery. When embedding static SVGs inline, prefix mask IDs per instance; ordinary image references are isolated.

Theme changes affect application chrome and controls. Error, warning and success colors retain their meaning. Website target content and persisted user annotation colors are independent of the application theme.
