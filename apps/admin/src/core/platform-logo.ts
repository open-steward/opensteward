/**
 * A platform's small logo for a table row or a list — or, when there is
 * nothing to load, the brand-tinted monogram the catalog shows in its place.
 *
 * Server-side twin of the tile logic in `packages/platforms-ui` (the catalog
 * renders its grid in the browser; pages like the dashboard render on the
 * server). Same three modes from the operator's logo settings, same
 * per-image fallback carried in `data-logo-fallback`, same luminance rule
 * for the monogram's foreground — so a logo looks the same wherever it is
 * shown. `public/js/platform-logo.js` performs the swap when an image fails.
 *
 * Decorative by design: the platform's name is always beside it, so the
 * image has an empty alt and the monogram is aria-hidden.
 */

export type LogoSource = 'none' | 'cdn' | 'local'

export interface PlatformLogoSubject {
  slug: string
  name: string
  vertical: string
  /** `#rrggbb` from the catalogue; anything else falls back to the vertical's palette. */
  primaryColor?: string | null
  /** Bare hostname, e.g. `fortnox.se`; what Brandfetch's CDN is keyed on. */
  domain?: string | null
}

export interface PlatformLogoOptions {
  logoSource: LogoSource
  brandfetchClientId?: string | null
  /** Footprint, matching the `vtile--*` sizes. Default `sm` (28px). */
  size?: 'xs' | 'sm' | 'lg'
  /** Where self-hosted logos are served from. Default the admin's logo proxy. */
  logoBasePath?: string
}

export const DEFAULT_LOGO_BASE_PATH = '/data/platforms/logos'

/** Two letters or digits of the name, else of the slug — `Fortnox` → `Fo`. */
export function platformInitials(name: string, slug: string): string {
  const fromName = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)
  if (fromName) return fromName
  return slug
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase()
}

export function renderPlatformLogo(p: PlatformLogoSubject, opts: PlatformLogoOptions): string {
  const size = opts.size ?? 'sm'
  if (opts.logoSource === 'cdn' && p.domain && opts.brandfetchClientId) {
    // Brandfetch's hotlink form, as the catalog (packages/platforms-ui) uses
    // it: the square icon, with fallback/404 so an unknown domain errors and
    // the monogram fallback fires instead of a 200 placeholder. No sizing
    // segments: the box caps the display size, and letting Brandfetch pick
    // the format means brands with no SVG still resolve.
    const src =
      'https://cdn.brandfetch.io/' +
      encodeURIComponent(p.domain) +
      '/fallback/404/icon?c=' +
      encodeURIComponent(opts.brandfetchClientId)
    return image(src, p, size, null)
  }
  if (opts.logoSource === 'local') {
    // The fetch may have produced .svg or .png; try the other once.
    const base = `${(opts.logoBasePath ?? DEFAULT_LOGO_BASE_PATH).replace(/\/$/, '')}/${encodeURIComponent(p.slug)}`
    return image(`${base}.svg`, p, size, `${base}.png`)
  }
  return monogram(p, size)
}

function monogram(p: PlatformLogoSubject, size: string): string {
  const initials = escapeHtml(platformInitials(p.name, p.slug))
  const classes = `vtile vtile--${size} vtile--${p.vertical}`
  const colour = /^#[0-9a-fA-F]{6}$/.test(p.primaryColor ?? '') ? p.primaryColor! : ''
  if (!colour) return `<span class="${escapeHtml(classes)}" aria-hidden="true">${initials}</span>`
  const fg = readableForeground(colour)
  return (
    `<span class="${escapeHtml(classes)} vtile--brand"` +
    ` style="background:${colour};color:${fg};border-color:${colour}" aria-hidden="true">` +
    `${initials}</span>`
  )
}

function image(src: string, p: PlatformLogoSubject, size: string, nextSrc: string | null): string {
  // referrerpolicy matters for the CDN mode: Brandfetch refuses requests
  // without a Referer, and helmet's default Referrer-Policy would strip it.
  // Scoped to the element so the app's policy stays as it is.
  return (
    `<span class="plogo plogo--${size}">` +
    `<img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"` +
    (nextSrc ? ` data-logo-next="${escapeHtml(nextSrc)}"` : '') +
    ` data-logo-fallback="${escapeHtml(monogram(p, size))}"></span>`
  )
}

/** WCAG 2.x relative luminance picks dark or light text for a brand colour. */
function readableForeground(hex: string): string {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.45 ? '#111827' : '#ffffff'
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
