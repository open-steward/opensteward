/**
 * View helpers shared across every EJS template.
 *
 * Wire-up lives in `core/server.ts` — these are spread into the
 * `defaultContext` block of the `@fastify/view` registration so every
 * render gets them automatically (no per-route plumbing).
 *
 * Keep this module dependency-free; EJS executes synchronously at
 * render time and any heavy import shows up as p99 page-load jitter.
 */

/**
 * Render a status pill from a raw status string. Used by every list/detail
 * view that surfaces a connection / sync-job / webhook status so the
 * vocabulary is one place.
 *
 * Unknown statuses fall through with the raw label in a neutral pill —
 * better than crashing or rendering a literal `undefined`.
 */
export function statusPill(status: string | null | undefined): string {
  const raw = String(status ?? '').trim()
  const map: Record<string, { tone: string; label: string }> = {
    // Connections — see CredentialStore `computeStatus()`
    valid: { tone: 'success', label: 'Healthy' },
    expiring_soon: { tone: 'warning', label: 'Expiring soon' },
    expired: { tone: 'danger', label: 'Expired' },
    platform_error: { tone: 'danger', label: 'Platform creds' },
    // The dashboard's early warning: still `valid`, but the last refresh failed
    refresh_failed: { tone: 'warning', label: 'Refresh failing' },

    // Verticals — see admin-api's Aggregator.healthCheck()
    up: { tone: 'success', label: 'Up' },
    down: { tone: 'danger', label: 'Down' },

    // Connect-link sessions
    active: { tone: 'success', label: 'Active' },
    consumed: { tone: 'info', label: 'Used' },

    // Sync jobs
    pending: { tone: 'info', label: 'Pending' },
    queued: { tone: 'info', label: 'Queued' },
    running: { tone: 'accent', label: 'Running' },
    syncing: { tone: 'accent', label: 'Syncing' },
    succeeded: { tone: 'success', label: 'Succeeded' },
    completed: { tone: 'success', label: 'Completed' },
    failed: { tone: 'danger', label: 'Failed' },
    cancelled: { tone: '', label: 'Cancelled' },
    dead: { tone: 'danger', label: 'Dead' },

    // Webhook deliveries
    delivered: { tone: 'success', label: 'Delivered' },
    retrying: { tone: 'warning', label: 'Retrying' },
    permanent_failure: { tone: 'danger', label: 'Permanent failure' },

    // Generic
    ok: { tone: 'success', label: 'OK' },
  }
  const m = map[raw] ?? { tone: '', label: raw || '—' }
  const toneClass = m.tone ? ` badge--${m.tone}` : ''
  return `<span class="badge${toneClass}"><span class="badge__dot"></span>${escapeHtml(m.label)}</span>`
}

/**
 * Up to two initials for the avatar fallback: `olivia.admin` → `OA`,
 * `alice@example.test` → `A` (the part before an `@` only), `—` → `?`.
 */
export function avatarInitials(name: string | null | undefined): string {
  const local = String(name ?? '').split('@')[0] ?? ''
  const words = local.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const initials = words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]!.toUpperCase())
    .join('')
  return initials || '?'
}

export interface AvatarPerson {
  id: string
  username: string
  /** Picture version from admin-api; absent/null renders initials. */
  avatarVersion?: string | null
}

/**
 * A user's picture, or their initials when they have none. The picture is
 * served same-origin by `routes/user-profile.ts`, versioned so a change shows
 * at once while the browser still caches it. Decorative by default (the name
 * is always printed beside it); pass `label` where it stands alone.
 */
export function avatar(
  person: AvatarPerson | null | undefined,
  size: 'sm' | 'lg' = 'sm',
  label?: string,
): string {
  if (!person) return ''
  const px = size === 'lg' ? 64 : 24
  const cls = `avatar avatar--${size}`
  const a11y = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"'
  if (person.avatarVersion) {
    const src = `/users/${encodeURIComponent(person.id)}/avatar?v=${encodeURIComponent(person.avatarVersion)}`
    const alt = label ? escapeHtml(label) : ''
    return `<img class="${cls}" src="${src}" alt="${alt}" width="${px}" height="${px}" loading="lazy" decoding="async">`
  }
  // The initials are drawn by CSS from the attribute (`.avatar[data-initials]
  // ::before`), not written as text: the cell's text stays the username, so
  // table sorting, filtering and copy-paste see the name alone.
  const initials = escapeHtml(avatarInitials(person.username))
  return `<span class="${cls} avatar--initials" data-initials="${initials}"${a11y}></span>`
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/**
 * Sidebar entries, in the order they are rendered. The source of truth for
 * which nav item a page belongs to.
 *
 * `/notifications` is deliberately absent: it is reached from the header bell,
 * which marks itself current (see layout.ejs), not from the sidebar.
 *
 * Kept beside the matcher rather than in the template so the rules below are
 * testable — a nav highlight is exactly the kind of thing that looks right on
 * the page you built it for and is wrong on three others.
 */
export const NAV_HREFS: readonly string[] = [
  '/',
  '/dashboards',
  '/connections',
  '/data',
  '/connect-links',
  '/connect-link-templates',
  '/customers',
  '/sync-jobs',
  '/setup/wizard',
  '/platforms',
  '/scope-groups',
  '/tenants',
  '/users',
  '/roles',
  '/destinations',
  '/sql-access',
  '/identity-providers',
  '/api-keys',
  '/oauth-clients',
  '/webhooks',
  '/audit',
  '/company-info',
  '/settings',
  '/settings/system',
]

/**
 * Which sidebar entry owns `path`, or null when none does.
 *
 * Three rules, each earning its place:
 *   - `/` matches only itself. It is a prefix of every path, so without this it
 *     would be permanently lit.
 *   - a match is the whole segment: `/x` or `/x/…`, never a bare `startsWith`.
 *     Otherwise `/connect-links` claims `/connect-link-templates` and two
 *     entries light up at once.
 *   - the longest match wins, so `/settings/system` marks System rather than
 *     Settings.
 *
 * Detail pages light up their section: `/platforms/accounting/xero` marks
 * Platforms, and `/setup/wizard/logos` marks the wizard.
 */
export function activeNavHref(path: string, hrefs: readonly string[] = NAV_HREFS): string | null {
  // A query string does not change which page you are on: /platforms?tab=logos
  // is still Platforms.
  const here = (path || '/').split('?')[0].split('#')[0]
  const matches = hrefs.filter((href) =>
    href === '/' ? here === '/' : here === href || here.startsWith(`${href}/`),
  )
  if (matches.length === 0) return null
  return matches.reduce((longest, href) => (href.length > longest.length ? href : longest))
}

/** Attributes for a sidebar link: the visible state plus what AT announces. */
export function navLinkAttrs(href: string, path: string): string {
  return activeNavHref(path) === href
    ? ' class="sidebar__link sidebar__link--active" aria-current="page"'
    : ' class="sidebar__link"'
}

/**
 * Serialize a value for embedding inside an inline `<script>` in an EJS view.
 *
 * `<%- JSON.stringify(x) %>` is NOT safe: `<%-` is EJS's unescaped output, and
 * `JSON.stringify` does not neutralize a literal `</script>` (nor `<!--` nor the
 * JS line terminators U+2028/U+2029), so any `x` carrying `</script>` — e.g. a
 * reflected `?platform=` query param — terminates the script element and starts
 * an attacker-controlled one (reflected XSS → operator account takeover, since
 * the payload can read the DOM `_csrf` token). Escaping the HTML-significant
 * characters to their `\uXXXX` forms keeps the JSON valid and round-trips to the
 * identical value in the browser. Use `<%- jsonForScript(x) %>` for EVERY value
 * embedded in a `<script>` block.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
