# Third-party notices

OpenSteward bundles and redistributes the third-party assets listed here. Their
own licenses apply to them, not [`LICENSE`](./LICENSE).

This file covers **assets shipped inside the repository and the published
container images**. It is not a dependency manifest — npm packages installed at
build time are listed in `package.json` and pinned in `pnpm-lock.yaml`.

---

## Fonts

Shipped in `packages/design-system/fonts/`, served from `/design/fonts/`.

| Font | License | Text |
|---|---|---|
| Inter Tight (variable) | SIL Open Font License 1.1 | [`InterTight-OFL.txt`](./packages/design-system/fonts/InterTight-OFL.txt) |
| JetBrains Mono (variable) | SIL Open Font License 1.1 | [`JetBrainsMono-OFL.txt`](./packages/design-system/fonts/JetBrainsMono-OFL.txt) |

The OFL text sits beside each font and travels with every copy, which is what
OFL 1.1 requires of redistributors. Two constraints worth knowing if you fork
or repackage OpenSteward: keep those files alongside the fonts, and do not sell
the fonts on their own — OFL permits bundling them in a larger work, not
selling them standalone.

---

## Vendored browser assets

Copied out of `node_modules` into `packages/design-system/vendor/` at build
time by [`sync-vendor.ts`](./packages/design-system/scripts/sync-vendor.ts) and
served from `/design/vendor/`. Versions are pinned in
[`packages/design-system/package.json`](./packages/design-system/package.json).

| Asset | Version | License | Used for |
|---|---|---|---|
| [Phosphor Icons](https://github.com/phosphor-icons/web) | 2.1.1 | MIT | icon webfont, admin + docs-server |
| [htmx](https://htmx.org) | 1.9.12 | 0BSD | admin UI interactivity |
| [Swagger UI](https://github.com/swagger-api/swagger-ui) | 5.x | Apache-2.0 | API reference rendering |
| [lunr](https://lunrjs.com) | 2.3.9 | MIT | docs search index |
| [Mermaid](https://mermaid.js.org) | 11.x | MIT | diagrams in guides |
| [svg-pan-zoom](https://github.com/bumbu/svg-pan-zoom) | 3.6.2 | BSD-2-Clause | expanding those diagrams |

These assets are vendored rather than loaded from a public CDN, so a
self-hosted deployment makes **no runtime request to any third party** — which
is what OpenSteward claims, and which matters most for the air-gapped and
egress-filtered deployments the project is built for. Vendoring also avoids
the supply-chain hole of a floating version tag on a public CDN, which serves
whatever it resolves to at request time.

Two builds are chosen deliberately rather than by default:

- **Phosphor's stylesheet is modified during the copy**: the `format("svg")`
  entry is removed from its `@font-face` src chain. That fallback is only
  reached by browsers supporting neither woff2, woff, nor truetype, and the
  file is 2.9 MB.
- **Mermaid ships as its UMD bundle, not ESM.** `mermaid.esm.min.mjs` is a
  32 KB loader that pulls 206 chunks at runtime, so vendoring the ESM build
  would mean shipping its whole 83 MB dist. The UMD build is one self-contained
  3.5 MB file.

lunr and Mermaid are both loaded as classic scripts reading the globals they
set, rather than via `import()`, because their UMD builds cannot be
dynamically imported.

---

## Platform logos

**None ship with OpenSteward.** The platform catalog renders brand-tinted
monogram tiles by default; operators opt in to real logos via `LOGO_SOURCE`.

The logos of the 1,548 supported platforms belong to those companies.
OpenSteward claims no rights in them and is not affiliated with or endorsed by
any of them. See [`docs/operations/platform-logos.md`](./docs/operations/platform-logos.md)
for the reasoning and the three options, and [`TRADEMARKS.md`](./TRADEMARKS.md)
for the trademark position.

---

## Canonical schemas

As recorded in [`NOTICE`](./NOTICE), OpenSteward's canonical resource schemas
were shape-inspired by the public API documentation of Unified.to, Shopify, and
Stripe. No code or content was copied from those sources.

---

## Test data

Committed for tests only: not part of any npm package or published container image.

| Asset | License | Text |
|---|---|---|
| PASETO v4 test vectors, [`packages/license-token/tests/fixtures/paseto-v4.json`](./packages/license-token/tests/fixtures/paseto-v4.json), from [paseto-standard/test-vectors](https://github.com/paseto-standard/test-vectors) | ISC, Copyright (c) 2021 Paragon Initiative Enterprises | [`PASETO-TEST-VECTORS-LICENSE`](./packages/license-token/tests/fixtures/PASETO-TEST-VECTORS-LICENSE) |

---

## Corrections

If something here is wrong, incomplete, or names your work without proper
attribution, open an issue or email **support@opensteward.dev**.
