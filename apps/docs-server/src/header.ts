/**
 * Shared sticky page header for every docs-server view.
 *
 * One source of truth for the nav so the landing, /platforms, /guides/*,
 * /postman, /unified-api and /operator-api (both Swagger UI) shells
 * stay aligned.
 *
 * Layout: [optional page-local anchor links, pipe-separated]
 *         |
 *         [shared menu — Guides · Platforms · Postman · Unified API ·
 *          Operator API · GitHub]
 *         [search trigger]
 *         [theme toggle]
 *
 * Page-local links go in the anchor slot, not the shared menu — that is
 * where the landing page's section anchors and the openapi.json /
 * openapi.yaml downloads on /unified-api are rendered.
 *
 * Below 880px none of that fits, so both groups collapse into a `<details>`
 * disclosure next to the search and theme buttons. Every link is rendered
 * twice — once inline, once in the panel — and the breakpoint decides which
 * is visible.
 *
 * It previously hid the links instead, all but the one flagged
 * `keepOnMobile`. That left a phone with exactly one reachable destination
 * (Unified API) and an orphaned `|` separator where the hidden group had
 * been. Hiding navigation with no affordance to reach it is the bug this
 * replaces, so there is deliberately no way to mark a link as inline-only.
 */

export const NAV_STYLES = `
  .oi-nav {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-6);
    height: 64px;
    padding: 0 var(--space-6);
    background: color-mix(in srgb, var(--paper) 80%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border-subtle);
  }
  .oi-nav__brand {
    display: flex; align-items: center; gap: var(--space-2);
    font-weight: 600; color: var(--fg-1); text-decoration: none;
    min-width: 0;
  }
  .oi-nav__brand svg.oi-nav__mark { height: 28px; width: 28px; color: var(--accent); flex: none; }
  .oi-nav__brand img.oi-nav__logo { height: 28px; width: auto; flex: none; }
  .oi-nav__links {
    display: flex; align-items: center;
    gap: var(--space-2);
    color: var(--fg-3); font-size: var(--text-sm);
    flex-wrap: wrap;
  }
  .oi-nav__links a { color: var(--fg-2); text-decoration: none; }
  .oi-nav__links a:hover { color: var(--fg-1); }
  .oi-nav__sep { color: var(--fg-3); user-select: none; }
  .oi-nav__group { display: inline-flex; align-items: center; gap: var(--space-2); }

  /* ── Mobile menu ─────────────────────────────────────────────────────────
     Below 880px the inline links do not fit, so they collapse into a
     disclosure instead of being hidden outright. A native <details> with no
     JS, matching .guides-sidebar-mobile — same breakpoint, same icon, same
     tokens.

     Every link lives in the panel, page-local anchors included: hiding a link
     with no way to reach it is what this replaces. */
  .oi-nav__menu { display: none; position: relative; }
  .oi-nav__menu > summary {
    display: flex; align-items: center; justify-content: center;
    /* 36px keeps the tap target at the same size as the search and theme
       buttons it sits beside. */
    width: 36px; height: 36px;
    border-radius: var(--radius-md);
    color: var(--fg-2); cursor: pointer;
    list-style: none;
  }
  /* Both spellings: WebKit needs the pseudo-element, the rest need list-style. */
  .oi-nav__menu > summary::-webkit-details-marker { display: none; }
  .oi-nav__menu > summary:hover { color: var(--fg-1); background: var(--surface-1); }
  .oi-nav__menu[open] > summary { color: var(--fg-1); background: var(--surface-1); }
  .oi-nav__menu-panel {
    position: absolute; right: 0; top: calc(100% + var(--space-2));
    display: flex; flex-direction: column;
    min-width: 190px;
    padding: var(--space-2);
    background: var(--paper);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
    /* Above the sticky header's own stacking context. */
    z-index: 20;
  }
  .oi-nav__menu-panel a {
    display: block;
    padding: var(--space-2);
    border-radius: var(--radius-sm, 6px);
    color: var(--fg-2); text-decoration: none;
    font-size: var(--text-sm); white-space: nowrap;
  }
  .oi-nav__menu-panel a:hover { color: var(--fg-1); background: var(--surface-1); }
  .oi-nav__menu-panel hr {
    margin: var(--space-2) 0;
    border: 0; border-top: 1px solid var(--border-subtle);
  }

  @media (max-width: 880px) {
    .oi-nav { height: 56px; padding: 0 var(--space-4); gap: var(--space-3); }
    .oi-nav__links { gap: var(--space-2); font-size: var(--text-xs); }
    /* The inline groups go, and the separators go with them — hiding the
       links individually used to leave an orphaned "|" behind. */
    .oi-nav__links > .oi-nav__group,
    .oi-nav__links > .oi-nav__sep { display: none; }
    .oi-nav__menu { display: block; }
  }
  @media (max-width: 480px) { .oi-nav__brand span { display: none; } }
`

export const THEME_TOGGLE = `<button type="button" class="btn btn--ghost btn--sm" data-theme-toggle onclick="oiToggleTheme()" aria-label="Switch theme"><i class="ph ph-moon"></i></button>`

export const SEARCH_TRIGGER = `<button type="button" class="btn btn--ghost btn--sm" data-search-open aria-haspopup="dialog" aria-controls="search-palette" aria-label="Search docs"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><kbd class="search-trigger__kbd">⌘K</kbd></button>`

export interface NavLink {
  href: string
  label: string
  /** Optional extra CSS class on the rendered <a>. Used for the mono openapi.* links on /unified-api. */
  className?: string
}

export interface RenderHeaderOpts {
  /**
   * Page-local nav links, sit in front of the shared menu and join with
   * ` | `. Used for anchor links on the landing page (#verticals, #features)
   * and for the openapi.json / openapi.yaml direct downloads on
   * /unified-api. Same visual slot for every page-specific item.
   */
  anchorLinks?: NavLink[]
}

const SHARED: NavLink[] = [
  { href: '/guides', label: 'Guides' },
  { href: '/platforms', label: 'Platforms' },
  { href: '/postman', label: 'Postman' },
  { href: '/unified-api', label: 'Unified API' },
  { href: '/operator-api', label: 'Operator API' },
  { href: 'https://github.com/open-steward/opensteward', label: 'GitHub' },
]

function linkHtml(l: NavLink): string {
  const cls = l.className ? ` class="${l.className}"` : ''
  return `<a href="${l.href}"${cls}>${l.label}</a>`
}

function joinWith(parts: string[], sep: string): string {
  if (parts.length === 0) return ''
  return parts.join(`<span class="oi-nav__sep">${sep}</span>`)
}

/**
 * Deployment-global operator brand for the nav (name + logo). There is exactly
 * one `company_info` record per deployment, so every request resolves to the
 * same brand — a module-level value refreshed per request (see branding.ts's
 * onRequest hook) is correct and lets `renderHeader()` stay synchronous, so we
 * don't have to thread the brand through every page builder. Defaults to
 * OpenSteward until the first refresh (and whenever admin-api is unreachable).
 */
let navBrand: { name: string | null; logoDataUrl: string | null; hideAttribution: boolean } = {
  name: null,
  logoDataUrl: null,
  hideAttribution: false,
}

export function setNavBrand(brand: {
  name: string | null
  logoDataUrl: string | null
  hideAttribution?: boolean
}): void {
  navBrand = { ...brand, hideAttribution: brand.hideAttribution ?? false }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )
}

const DEFAULT_MARK = `<svg class="oi-nav__mark" viewBox="0 0 64 64" role="img" aria-label="OpenSteward">
        <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="32" r="8.5"></circle>
          <line x1="26.5" y1="32" x2="52" y2="32"></line>
          <line x1="44" y1="32" x2="44" y2="40"></line>
          <line x1="50" y1="32" x2="50" y2="38"></line>
        </g>
      </svg>`

/** The operator's logo (validated data URL) or the default OpenSteward mark.
 *  Under white-label (`hideAttribution`) the default mark is suppressed when no
 *  operator logo is set, so the nav never shows the OpenSteward glyph. */
function brandMark(): string {
  const logo = navBrand.logoDataUrl
  if (logo && /^data:image\/[a-z+.-]+;base64,/i.test(logo)) {
    return `<img class="oi-nav__logo" src="${escapeHtml(logo)}" alt="${escapeHtml(navBrand.name ?? 'Home')}">`
  }
  return navBrand.hideAttribution ? '' : DEFAULT_MARK
}

export function renderHeader(opts: RenderHeaderOpts = {}): string {
  const anchors = opts.anchorLinks ?? []
  const anchorHtml =
    anchors.length > 0
      ? `<span class="oi-nav__group">${joinWith(anchors.map(linkHtml), ' | ')}</span>`
      : ''
  const sharedHtml = `<span class="oi-nav__group">${joinWith(SHARED.map(linkHtml), ' &middot; ')}</span>`
  // The pipe between groups doubles as the visual hand-off from
  // page-local anchors to the shared menu. It is a direct child of
  // .oi-nav__links so the mobile rule can hide it alongside the groups.
  const groupSep = anchors.length > 0 ? `<span class="oi-nav__sep">&nbsp;|&nbsp;</span>` : ''
  // The same links, stacked, for the sub-880px disclosure. Page-local anchors
  // first and divided off, mirroring the inline order.
  const menuHtml = `
      <details class="oi-nav__menu">
        <summary aria-label="Menu"><i class="ph ph-list" aria-hidden="true"></i></summary>
        <div class="oi-nav__menu-panel">
          ${anchors.length > 0 ? `${anchors.map(linkHtml).join('')}<hr>` : ''}${SHARED.map(linkHtml).join('')}
        </div>
      </details>`
  return `
  <header class="oi-nav" aria-label="Primary">
    <a href="/" class="oi-nav__brand" aria-label="${escapeHtml(navBrand.name ?? 'Home')}">
      ${brandMark()}
      ${
        navBrand.name || !navBrand.hideAttribution
          ? `<span>${escapeHtml(navBrand.name ?? 'OpenSteward')}</span>`
          : ''
      }
    </a>
    <div class="oi-nav__links">
      ${anchorHtml}${groupSep}${sharedHtml}
      ${menuHtml}
      ${SEARCH_TRIGGER}
      ${THEME_TOGGLE}
    </div>
  </header>
  `
}
