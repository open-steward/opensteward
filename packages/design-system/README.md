# @opensteward/design-system

Design tokens, fonts, logo, and component styles for OpenSteward apps.

## Contents

| Path | What |
|------|------|
| `tokens.css` | CSS custom properties — colors, type, spacing, radii, shadows, motion. Single source of truth. |
| `base.css` | Body, focus ring, `::selection`, reduced-motion support. Import after `tokens.css`. |
| `components.css` | `.btn`, `.input`, `.badge`, `.card`, `.vtile`, `.app-shell`, `.sidebar`, `.table`, `.alert`. BEM-style. |
| `fonts/` | Inter Tight + JetBrains Mono variable TTFs (OFL 1.1). Self-hosted, no CDN. |
| `logo/` | `mark.svg` (key-classic, `stroke="currentColor"` so a single file themes inline for light + dark via the surrounding text colour), `mark-dark.svg` (lichen `#90AE78`, favicon-only — browsers can't pick up parent CSS `color` through `<link rel="icon">`, so pair it with `mark.svg` via `prefers-color-scheme` media queries), `wordmark.svg` (single-colour, two-weight Inter Tight). |
| `icons/verticals/` | 32×32 `stroke="currentColor"` line-art icons per vertical (accounting / crm / ecommerce / logistics / payments). |
| `index.ts` | Node exports for absolute asset paths (Fastify static mounts etc.). |

## Consuming from a Fastify app

1. Add dependency: `"@opensteward/design-system": "workspace:*"`
2. Serve package root as static under `/design/`:

```ts
import { designSystemRoot } from '@opensteward/design-system'
import fastifyStatic from '@fastify/static'

await app.register(fastifyStatic, {
  root: designSystemRoot,
  prefix: '/design/',
  decorateReply: false,
})
```

3. Link stylesheets in your layout:

```html
<link rel="stylesheet" href="/design/tokens.css">
<link rel="stylesheet" href="/design/base.css">
<link rel="stylesheet" href="/design/components.css">
```

Fonts auto-load from `/design/fonts/` via `@font-face` in `tokens.css`.

## Iconography

Phosphor icons via CDN (per design system spec):

```html
<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>
<i class="ph ph-plug"></i>
<i class="ph-fill ph-plug"></i>  <!-- active/selected -->
```

## Voice

Sentence case everywhere. No emoji in product UI. No "effortless / seamless / revolutionary." See main `README.md` for full voice rules.
