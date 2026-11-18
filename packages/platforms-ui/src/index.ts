export type VerticalKey =
  | 'accounting'
  | 'crm'
  | 'ecommerce'
  | 'logistics'
  | 'payments'
  | 'docsign'
  | 'projects'
  | 'customer-support'
  | 'inventory'

/**
 * Each vertical's tag name in the unified OpenAPI spec, which is what the
 * Unified API's `#tag/<name>` fragment must match exactly for Swagger UI to
 * open that vertical.
 *
 * This is not the display label. docsign shows as "E-signature" and
 * customer-support as "Customer Support", but
 * apps/integration-server/scripts/generate-openapi.ts tags them `Docsign` and
 * `CustomerSupport`. Linking by label opened the reference with nothing
 * selected on every card in those two verticals. docs-server's landing page
 * reads this same table.
 *
 * tests/card-api-tag-link.test.ts checks every entry against the generated
 * spec, so a renamed tag fails the test.
 */
export const VERTICAL_OPENAPI_TAG: Readonly<Record<VerticalKey, string>> = {
  accounting: 'Accounting',
  crm: 'CRM',
  ecommerce: 'Ecommerce',
  logistics: 'Logistics',
  payments: 'Payments',
  docsign: 'Docsign',
  projects: 'Projects',
  'customer-support': 'CustomerSupport',
  inventory: 'Inventory',
}

export interface PlatformEntry {
  vertical: VerticalKey | string
  slug: string
  name: string
  description?: string
  website?: string
  category?: string
  primary_color?: string
  auth_type?: string
  auth_label?: string
  hq_country?: string
  country_label?: string
  docs_url?: string
  pricing_url?: string
  founded_year?: number
  webhook?: boolean
  /** Bare hostname from `website`, e.g. `stripe.com`. Used to build
   *  Brandfetch CDN URLs when logoSource is 'cdn'. */
  domain?: string
  configured?: boolean
  connection_count?: number
  /** True when `docs/integrate/<vertical>/<slug>.md` exists at build time.
   *  Set by `pnpm docs:platforms` (the catalog generator) — see
   *  apps/integration-server/scripts/generate-platforms-doc.ts. */
  has_guide?: boolean
  /**
   * Set when the platform cannot be enabled or connected today — it stays
   * listed and viewable, but `cardFor()` never offers a Configure / Edit
   * config action for it. Typed structurally rather than imported: this
   * mirrors `@opensteward/shared`'s `UnsupportedPlatform`
   * (`packages/shared/src/reference/platform-status.ts`), which this
   * package does not depend on.
   */
  unsupported?: {
    /** Why the platform cannot be connected today. */
    reason: string
    /** Tracking issue, e.g. https://github.com/open-steward/opensteward/issues/<n> */
    issueUrl?: string
  }
  /**
   * How far this adapter has actually been exercised. Absent means scaffolded
   * — generated but never run against the real API, which is where nearly the
   * whole catalog sits, so absence renders no chip at all rather than a
   * "Scaffolded" badge on 1,544 cards. Typed as a string union rather than
   * imported for the same reason as `unsupported` above: this package does not
   * depend on `@opensteward/shared`, whose `VerificationTier`
   * (`packages/shared/src/reference/platform-verification.ts`) this mirrors.
   */
  verification?: 'unit-tested' | 'verified'
}

export interface PlatformsDataset {
  generated_at?: string
  total: number
  counts: Record<string, number>
  platforms: PlatformEntry[]
}

export type LogoSource = 'none' | 'cdn' | 'local'

export interface PlatformsBodyOpts {
  dataUrl?: string
  logoBasePath?: string
  /**
   * Where platform logos come from. Logos are not shipped with OpenSteward —
   * see docs/operations/platform-logos.md for the full rationale.
   *
   *   'none'  (default) monogram tiles only. No external requests, no account,
   *           works air-gapped. The only mode with no legal surface at all.
   *   'cdn'   hotlink Brandfetch. This is the mode Brandfetch sanctions
   *           ("we require logo links to be directly embedded"). Needs
   *           brandfetchClientId. Costs privacy: every tile tells Brandfetch
   *           the viewer's origin and which platforms they browse.
   *   'local' serve files previously fetched to logoBasePath. Private and
   *           air-gap safe, but it is caching, which Brandfetch's terms say
   *           needs an agreement with them — the operator's own call.
   *
   * Every mode falls back to a monogram per-tile, so a bad client ID, a rate
   * limit, or a missing file degrades instead of breaking.
   */
  logoSource?: LogoSource
  /** Brandfetch client ID, required when logoSource is 'cdn'. Safe to expose:
   *  Brandfetch designed it to be embedded in public `<img>` tags. */
  brandfetchClientId?: string
  showOverlay?: boolean
  apiTagBase?: string
  /**
   * When set, renders a "Configure" button on each card linking to
   * `<configureBasePath>/<vertical>/<slug>`. Use on the admin platforms
   * page; leave undefined on the public docs-server catalog page.
   */
  configureBasePath?: string
  /**
   * Origin (e.g. `http://localhost:3003`) to prefix the per-platform
   * "Guide" link with. The component is shared between docs-server
   * (same-origin, leave undefined → relative `/guides/...`) and admin
   * (different origin → must be absolute, otherwise the browser
   * resolves to localhost:3000 and 404s).
   */
  guideHrefBase?: string
  /**
   * The whole "Guide" href, with `{vertical}` and `{slug}` filled in
   * (URI-encoded) on each card, e.g. `'/integrate/{vertical}/{slug}/'` for
   * the opensteward.dev website, which publishes the guides at its own paths.
   * Used as given: guideHrefBase is not prefixed to it. Defaults to
   * `<guideHrefBase>/guides/integrate/{vertical}/{slug}.md`, docs-server's
   * own guide route.
   */
  guideHrefTemplate?: string
}

const STYLES = `
    .providers-section { max-width: var(--content-max); margin: 0 auto; padding: var(--space-10) var(--space-6); }
    .providers-hero { margin-bottom: var(--space-8); }
    .providers-hero h1 { font-size: var(--text-3xl); line-height: var(--leading-tight); letter-spacing: var(--tracking-tight); margin: var(--space-2) 0 var(--space-3); }
    .providers-hero p { color: var(--fg-2); max-width: 64ch; margin: 0; }

    .providers-controls {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
      align-items: center;
    }
    .providers-search { position: relative; flex: 1; min-width: 240px; max-width: 520px; }
    .providers-search i { position: absolute; left: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--fg-3); font-size: 18px; }
    .providers-search input {
      width: 100%;
      height: 40px;
      padding: 0 var(--space-4) 0 calc(var(--space-3) + 26px);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--fg-1);
      background: var(--surface-0);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      outline: none;
      transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
    }
    .providers-search input:focus { border-color: var(--accent); box-shadow: var(--shadow-focus); }

    /* Filterbar styling comes from the design-system .segmented control
       (components.css). That control is a single no-wrap row, which the
       vertical group's ten pills overflow at phone width, so here both
       filter groups wrap inside the controls row instead. */
    .providers-controls .segmented { flex-wrap: wrap; max-width: 100%; }

    .providers-count { margin: var(--space-3) 0 var(--space-6); color: var(--fg-3); font-size: var(--text-sm); }

    .providers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-3);
    }
    .provider-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-4);
      background: var(--surface-0);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      transition: border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
    }
    .provider-card:hover { border-color: var(--border-strong); }
    .provider-card__head { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
    .provider-card__tile {
      flex-shrink: 0;
      width: 40px; height: 40px;
      display: inline-flex; align-items: center; justify-content: center;
      font-family: var(--font-mono); font-size: 13px; font-weight: 700;
      border-radius: var(--radius-md);
      border: 1px solid transparent;
    }
    .provider-card__logo {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px; height: 40px;
      background: var(--surface-0);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    /* Brand-tinted monogram, used when no logo is loaded (LOGO_SOURCE=none,
       or any mode whose image failed). Its background, color and
       border-color come from the platform's primary_color, with a
       luminance-picked foreground, and are set from script (see
       applyBrandColours) because a CSP with style-src 'self' blocks inline
       style attributes. This rule only supplies what those cannot. */
    .vtile--brand { border-style: solid; border-width: 1px; }
    .provider-card__logo img {
      max-width: 28px;
      max-height: 28px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .provider-card__ident { min-width: 0; flex: 1; }
    .provider-card__name { font-size: var(--text-md); font-weight: 600; color: var(--fg-1); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .provider-card__slug { display: block; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .provider-card__desc { font-size: var(--text-sm); color: var(--fg-2); line-height: var(--leading-snug); margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .provider-card__meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: var(--space-2); }
    .provider-card__meta .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 8px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border-subtle);
      background: var(--surface-1);
      color: var(--fg-3);
      font-size: 11px;
      font-weight: 500;
    }
    .provider-card__meta .chip--ok {
      border-color: color-mix(in srgb, #16a34a 35%, transparent);
      background: color-mix(in srgb, #16a34a 14%, transparent);
      color: #16a34a;
    }
    .provider-card__meta .chip--available {
      border-color: var(--border-default);
      background: var(--surface-0);
      color: var(--fg-2);
    }
    .provider-card__meta .chip--warning {
      border-color: color-mix(in srgb, var(--warning) 35%, transparent);
      background: var(--warning-bg);
      color: var(--warning-fg);
    }
    /* Verification rungs, ordered by visual weight so a glance across the
       grid ranks them: Verified is the strong claim, Unit tested the weak
       one. An unverified platform gets no chip at all. */
    .provider-card__meta .chip--verified-api {
      border-color: color-mix(in srgb, #16a34a 45%, transparent);
      background: color-mix(in srgb, #16a34a 16%, transparent);
      color: #15803d;
    }
    .provider-card__meta .chip--verified-unit {
      border-color: var(--border-default);
      background: var(--surface-0);
      color: var(--fg-2);
    }
    .provider-card--unsupported {
      border-color: color-mix(in srgb, var(--warning) 35%, var(--border-default));
    }
    .provider-card__unsupported {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: var(--text-xs);
      color: var(--fg-2);
    }
    .provider-card__unsupported a { color: var(--accent-fg); text-decoration: none; }
    .provider-card__unsupported a:hover { text-decoration: underline; }
    .provider-card__links { display: flex; gap: var(--space-3); font-size: var(--text-xs); }
    .provider-card__links a { color: var(--accent-fg); text-decoration: none; }
    .provider-card__links a:hover { text-decoration: underline; }
    .provider-card__actions { margin-top: var(--space-3); display: flex; }
    .provider-card__actions .btn { width: 100%; justify-content: center; }

    .providers-empty {
      text-align: center;
      padding: var(--space-16) var(--space-6);
      color: var(--fg-3);
    }
    .providers-empty i { font-size: 32px; margin-bottom: var(--space-3); display: block; }
`

function buildClientScript(
  opts: Required<
    Pick<
      PlatformsBodyOpts,
      'dataUrl' | 'logoBasePath' | 'showOverlay' | 'apiTagBase' | 'logoSource'
    >
  > &
    Pick<PlatformsBodyOpts, 'configureBasePath' | 'brandfetchClientId'> & {
      guideHrefTemplate: string
    },
): string {
  const {
    dataUrl,
    logoBasePath,
    showOverlay,
    apiTagBase,
    configureBasePath,
    guideHrefTemplate,
    logoSource,
    brandfetchClientId,
  } = opts
  return `
    (async function () {
      var DATA_URL = ${JSON.stringify(dataUrl)}
      var LOGO_BASE = ${JSON.stringify(logoBasePath)}
      var SHOW_OVERLAY = ${showOverlay ? 'true' : 'false'}
      var API_TAG_BASE = ${JSON.stringify(apiTagBase)}
      var VERTICAL_TAG = ${JSON.stringify(VERTICAL_OPENAPI_TAG)}
      var LOGO_SOURCE = ${JSON.stringify(logoSource)}
      var BRANDFETCH_CLIENT_ID = ${JSON.stringify(brandfetchClientId ?? '')}
      var CONFIGURE_BASE = ${JSON.stringify(configureBasePath ?? '')}
      var GUIDE_TEMPLATE = ${JSON.stringify(guideHrefTemplate)}

      var VERTICAL_CLASS = {
        accounting: 'vtile--accounting',
        crm: 'vtile--crm',
        ecommerce: 'vtile--ecommerce',
        logistics: 'vtile--logistics',
        payments: 'vtile--payments',
        docsign: 'vtile--docsign',
        projects: 'vtile--projects',
        'customer-support': 'vtile--customer-support',
        inventory: 'vtile--inventory'
      }
      var VERTICAL_LABEL = { crm: 'CRM', api: 'API', sdk: 'SDK', docsign: 'E-signature', 'customer-support': 'Customer Support' }
      function vLabel(v) { return VERTICAL_LABEL[v] || (v.charAt(0).toUpperCase() + v.slice(1)) }

      var grid = document.getElementById('grid')
      var empty = document.getElementById('empty')
      var countEl = document.getElementById('count')
      var q = document.getElementById('q')
      var filters = document.getElementById('vertical-filters')
      var statusFilters = document.getElementById('status-filters')

      // The status filters that follow their group's own All pill. One at a
      // time, ANDed with the vertical and the search. Unsupported matches the
      // cards that carry the Unsupported banner.
      var STATUSES = [
        { key: 'verified', label: 'Verified', test: function (p) { return p.verification === 'verified' } },
        { key: 'unsupported', label: 'Unsupported', test: function (p) { return !!p.unsupported } }
      ]

      var data = { platforms: [], counts: {}, total: 0 }
      try {
        var res = await fetch(DATA_URL, { cache: 'no-store', credentials: 'same-origin' })
        data = await res.json()
      } catch (e) {
        countEl.textContent = 'Failed to load platforms.'
        return
      }

      var verticals = Object.keys(data.counts || {}).sort()
      var state = { q: '', vertical: null, status: null }

      filters.classList.remove('platforms-ui-pill-group')
      filters.classList.add('segmented')
      filters.setAttribute('role', 'tablist')

      var allPill = document.createElement('button')
      allPill.type = 'button'
      allPill.className = 'segmented__btn'
      allPill.setAttribute('role', 'tab')
      allPill.textContent = 'All · ' + data.total
      allPill.setAttribute('aria-pressed', 'true')
      allPill.onclick = function () { state.vertical = null; syncHash(); render() }
      filters.appendChild(allPill)
      verticals.forEach(function (v) {
        var pill = document.createElement('button')
        pill.type = 'button'
        pill.className = 'segmented__btn'
        pill.setAttribute('role', 'tab')
        pill.setAttribute('data-vertical', v)
        pill.setAttribute('aria-pressed', 'false')
        pill.textContent = vLabel(v) + ' · ' + (data.counts[v] || 0)
        pill.onclick = function () { state.vertical = (state.vertical === v ? null : v); syncHash(); render() }
        filters.appendChild(pill)
      })

      // Plain toggle buttons in a role=group, not tabs: nothing here is a
      // tab panel. No deep link: the status choice never touches the URL.
      function statusPill(key, label, n) {
        var pill = document.createElement('button')
        pill.type = 'button'
        pill.className = 'segmented__btn'
        pill.setAttribute('data-status', key)
        pill.setAttribute('aria-pressed', String(key === 'all'))
        pill.textContent = label + ' · ' + n
        pill.onclick = function () { state.status = (key === 'all' || state.status === key ? null : key); render() }
        statusFilters.appendChild(pill)
      }
      statusPill('all', 'All', data.total)
      STATUSES.forEach(function (s) {
        statusPill(s.key, s.label, (data.platforms || []).filter(s.test).length)
      })

      // Deep link: \`#vertical=<slug>\` opens on that vertical's pill (the docs
      // landing page's "Browse <vertical> adapters" links). A hash rather than
      // \`?vertical=\` because the admin mounts this at /platforms too, where
      // that query param already filters its Configure table. Opt-in by URL:
      // until a \`#vertical=\` hash has been seen, nothing here writes the
      // address bar or acts on any other hash change, and an unknown slug
      // falls back to All. Guarded for hosts with no \`location\`.
      var LOC = typeof location !== 'undefined' ? location : null
      function hashVertical() {
        var m = LOC && /^#vertical=(.*)$/.exec(LOC.hash || '')
        if (!m) return undefined
        var v
        try { v = decodeURIComponent(m[1]) } catch (e) { return null }
        return Object.prototype.hasOwnProperty.call(data.counts || {}, v) ? v : null
      }
      var deepLinked = hashVertical() !== undefined
      // Keep a deep-linked URL honest once the reader picks another pill, so
      // reloading or sharing it shows what is on screen — including every
      // pick after All has cleared the hash.
      function syncHash() {
        if (!deepLinked || typeof history === 'undefined' || !history.replaceState) return
        var base = LOC.pathname + LOC.search
        history.replaceState(null, '', state.vertical ? base + '#vertical=' + encodeURIComponent(state.vertical) : base)
      }
      state.vertical = hashVertical() || null
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('hashchange', function () {
          var v = hashVertical()
          if (v !== undefined) deepLinked = true
          // Any other hash is some other anchor — leave the filter alone —
          // except an emptied one on a deep-linked page (Back to bare /platforms).
          else if (!deepLinked || (LOC.hash && LOC.hash !== '#')) return
          state.vertical = v || null
          render()
        })
      }

      // Roving tabindex: arrow-keys move focus across each segmented group.
      function roveWithArrows(group) {
        group.addEventListener('keydown', function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
          var btns = Array.prototype.slice.call(group.querySelectorAll('.segmented__btn'))
          var i = btns.indexOf(document.activeElement)
          if (i < 0) return
          e.preventDefault()
          var next = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length
          btns[next].focus()
        })
      }
      roveWithArrows(filters)
      roveWithArrows(statusFilters)

      q.addEventListener('input', function () { state.q = q.value.trim().toLowerCase(); render() })

      function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c] }) }
      function escapeAttr(s) { return escapeHtml(s) }

      // Monogram tile, tinted with the platform's own brand colour so the
      // no-logo default reads as designed rather than broken. Falls back to
      // the vertical's class colours when primary_color is absent or malformed.
      //
      // The colours ride on data-brand-* and applyBrandColours() sets them
      // through CSSOM once the markup is in the document. An inline style attribute
      // would be blocked by a style-src 'self' CSP (the opensteward.dev
      // website's); element.style is not.
      function monogramHtml(p, initials, tileClass) {
        var c = /^#[0-9a-fA-F]{6}$/.test(p.primary_color || '') ? p.primary_color : ''
        if (!c) return '<span class="' + tileClass + '">' + escapeHtml(initials) + '</span>'
        // Relative luminance (sRGB, WCAG 2.x) picks a readable foreground.
        var r = parseInt(c.slice(1, 3), 16) / 255
        var g = parseInt(c.slice(3, 5), 16) / 255
        var b = parseInt(c.slice(5, 7), 16) / 255
        function lin(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
        var L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        var fg = L > 0.45 ? '#111827' : '#ffffff'
        return '<span class="' + tileClass + ' vtile--brand" data-brand-bg="' + escapeAttr(c) +
          '" data-brand-fg="' + fg + '">' + escapeHtml(initials) + '</span>'
      }

      function applyBrandColours(root) {
        var tiles = root.querySelectorAll('[data-brand-bg]')
        for (var i = 0; i < tiles.length; i++) {
          var c = tiles[i].getAttribute('data-brand-bg')
          tiles[i].style.background = c
          tiles[i].style.color = tiles[i].getAttribute('data-brand-fg')
          tiles[i].style.borderColor = c
        }
      }

      // Logo <img> for the modes that load one. Fallback is handled by one
      // delegated listener (see below) rather than an inline onerror, which
      // would mean nesting quoted HTML inside a quoted attribute inside a JS
      // string — unreadable and easy to break.
      //
      // referrerpolicy is required for LOGO_SOURCE=cdn: Brandfetch rejects
      // requests without a Referer, and @fastify/helmet's default
      // Referrer-Policy is no-referrer, which would strip it and make every
      // logo silently fail. Setting it on the element keeps the fix scoped to
      // these requests instead of weakening the whole app's referrer policy.
      // Harmless in local mode.
      function logoImg(src, p, initials, tileClass, nextSrc) {
        return '<span class="provider-card__logo">' +
          '<img src="' + escapeAttr(src) + '"' +
          ' alt="' + escapeAttr(p.name) + ' logo"' +
          ' loading="lazy" referrerpolicy="strict-origin-when-cross-origin"' +
          (nextSrc ? ' data-logo-next="' + escapeAttr(nextSrc) + '"' : '') +
          ' data-logo-fallback="' + escapeAttr(monogramHtml(p, initials, tileClass)) + '">' +
          '</span>'
      }

      // The error event does not bubble, so this listens in the capture phase. One
      // listener for the whole grid survives re-renders of its innerHTML.
      grid.addEventListener('error', function (ev) {
        var img = ev.target
        if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-logo-fallback')) return
        var next = img.getAttribute('data-logo-next')
        if (next) {
          // 'local' mode does not know whether the operator's fetch produced
          // .svg or .png — platforms.json carries no disk-derived field, or it
          // would regenerate differently for a maintainer who has fetched
          // logos than for a fresh clone. Try the other extension once.
          img.removeAttribute('data-logo-next')
          img.src = next
          return
        }
        var parent = img.parentElement
        if (parent) parent.classList.add('provider-card__logo--fallback')
        img.outerHTML = img.getAttribute('data-logo-fallback')
        if (parent) applyBrandColours(parent)
      }, true)

      function cardFor(p) {
        var initials = (p.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || (p.slug || '').slice(0, 2).toUpperCase()
        var tileClass = 'vtile vtile--lg ' + (VERTICAL_CLASS[p.vertical] || '')

        var logoHtml
        if (LOGO_SOURCE === 'cdn' && p.domain && BRANDFETCH_CLIENT_ID) {
          // Brandfetch hotlink: /{domain}/fallback/404/icon?c={clientId}.
          // icon is the square mark (logo is the wide wordmark, a thin strip
          // in a 28px box). fallback/404 makes an unknown domain answer 404 so
          // the <img> errors and the monogram fallback fires. Without it the
          // CDN answers 200 with a placeholder. No sizing segments:
          // .provider-card__logo img caps display at 28px, and letting
          // Brandfetch pick the format means brands with no SVG still resolve.
          logoHtml = logoImg(
            'https://cdn.brandfetch.io/' + encodeURIComponent(p.domain) + '/fallback/404/icon?c=' + encodeURIComponent(BRANDFETCH_CLIENT_ID),
            p, initials, tileClass, null
          )
        } else if (LOGO_SOURCE === 'local') {
          var base = LOGO_BASE + '/' + encodeURIComponent(p.slug)
          logoHtml = logoImg(base + '.svg', p, initials, tileClass, base + '.png')
        } else {
          logoHtml = monogramHtml(p, initials, tileClass)
        }

        var chips = []
        if (SHOW_OVERLAY) {
          if (p.configured) {
            var label = (p.connection_count && p.connection_count > 0)
              ? 'Configured · ' + p.connection_count
              : 'Configured'
            chips.push('<span class="chip chip--ok"><i class="ph ph-check-circle" aria-hidden="true"></i>' + escapeHtml(label) + '</span>')
          } else {
            chips.push('<span class="chip chip--available">Available</span>')
          }
        }
        chips.push('<span class="chip">' + escapeHtml(vLabel(p.vertical)) + '</span>')
        if (p.auth_label) chips.push('<span class="chip"><i class="ph ph-lock-key" aria-hidden="true"></i>' + escapeHtml(p.auth_label) + '</span>')
        if (p.country_label) chips.push('<span class="chip">' + escapeHtml(p.country_label) + '</span>')
        if (p.webhook) chips.push('<span class="chip"><i class="ph ph-webhooks-logo" aria-hidden="true"></i>Webhooks</span>')
        // Verification rung, when someone has made a claim. No chip at all for
        // the scaffolded majority — a badge on every card would say nothing.
        var VERIFY_CHIPS = {
          verified: ['chip--verified-api', 'ph-seal-check', 'Verified'],
          'unit-tested': ['chip--verified-unit', 'ph-test-tube', 'Unit tested']
        }
        var verifyChip = p.verification ? VERIFY_CHIPS[p.verification] : null
        if (verifyChip) {
          chips.push(
            '<span class="chip ' + verifyChip[0] + '" title="' +
            escapeAttr('Verification: ' + verifyChip[2] + '. See docs/platforms/platforms.md#verification') +
            '"><i class="ph ' + verifyChip[1] + '" aria-hidden="true"></i>' + escapeHtml(verifyChip[2]) + '</span>'
          )
        }

        var links = []
        // The spec's tag name, not vLabel(): see VERTICAL_OPENAPI_TAG. A
        // vertical with no tag gets no link, because a link that cannot select
        // its vertical is the bug this replaced.
        var tag = Object.prototype.hasOwnProperty.call(VERTICAL_TAG, p.vertical) ? VERTICAL_TAG[p.vertical] : ''
        if (API_TAG_BASE && tag) {
          links.push('<a href="' + API_TAG_BASE + encodeURIComponent(tag) + '">API</a>')
        }
        if (p.website) links.push('<a href="' + escapeAttr(p.website) + '" target="_blank" rel="noreferrer noopener">Website</a>')
        if (p.docs_url) links.push('<a href="' + escapeAttr(p.docs_url) + '" target="_blank" rel="noreferrer noopener">Docs</a>')
        if (p.has_guide) {
          // split/join rather than a regex replace: no replacement-pattern surprises,
          // and an encoded value can never contain a placeholder ({ and } encode).
          var guideHref = GUIDE_TEMPLATE
            .split('{vertical}').join(encodeURIComponent(p.vertical))
            .split('{slug}').join(encodeURIComponent(p.slug))
          links.push('<a href="' + escapeAttr(guideHref) + '" target="_blank" rel="noreferrer noopener">Guide</a>')
        }

        // An unsupported platform stays listed and viewable but can never be
        // enabled or connected — no Configure/Edit-config action below, and
        // this banner states why, escaped like every other operator-facing
        // string on the card.
        var unsupportedHtml = ''
        if (p.unsupported) {
          var issueLink = p.unsupported.issueUrl
            ? ' <a href="' + escapeAttr(p.unsupported.issueUrl) + '" target="_blank" rel="noreferrer noopener">Tracking issue</a>'
            : ''
          unsupportedHtml =
            '<div class="provider-card__unsupported">' +
              '<span class="chip chip--warning"><i class="ph ph-warning-circle" aria-hidden="true"></i>Unsupported</span>' +
              '<span>' + escapeHtml(p.unsupported.reason) + '</span>' +
              issueLink +
            '</div>'
        }

        var actionsHtml = ''
        if (CONFIGURE_BASE && !p.unsupported) {
          var configHref = CONFIGURE_BASE + '/' + encodeURIComponent(p.vertical) + '/' + encodeURIComponent(p.slug)
          var configLabel = p.configured ? 'Edit config' : 'Configure'
          var configClass = p.configured ? 'btn btn--ghost btn--sm' : 'btn btn--primary btn--sm'
          actionsHtml = '<div class="provider-card__actions"><a class="' + configClass + '" href="' + escapeAttr(configHref) + '"><i class="ph ph-gear" aria-hidden="true"></i> ' + configLabel + '</a></div>'
        }

        return (
          '<article class="provider-card' + (p.unsupported ? ' provider-card--unsupported' : '') + '">' +
            '<div class="provider-card__head">' +
              logoHtml +
              '<div class="provider-card__ident">' +
                '<div class="provider-card__name">' + escapeHtml(p.name) + '</div>' +
                '<span class="provider-card__slug">' + escapeHtml(p.slug) + '</span>' +
              '</div>' +
            '</div>' +
            (p.description ? '<p class="provider-card__desc">' + escapeHtml(p.description) + '</p>' : '') +
            '<div class="provider-card__meta">' + chips.join('') + '</div>' +
            unsupportedHtml +
            (links.length ? '<div class="provider-card__links">' + links.join('') + '</div>' : '') +
            actionsHtml +
          '</article>'
        )
      }

      function matches(p) {
        if (state.vertical && p.vertical !== state.vertical) return false
        if (state.status && !STATUSES.some(function (s) { return s.key === state.status && s.test(p) })) return false
        if (!state.q) return true
        var hay = ((p.name || '') + ' ' + (p.slug || '') + ' ' + (p.vertical || '') + ' ' + (p.category || '') + ' ' + (p.country_label || '') + ' ' + (p.auth_label || '') + ' ' + (p.description || '')).toLowerCase()
        return hay.indexOf(state.q) !== -1
      }

      function render() {
        filters.querySelectorAll('[data-vertical]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.getAttribute('data-vertical') === state.vertical))
        })
        allPill.setAttribute('aria-pressed', String(state.vertical === null))
        statusFilters.querySelectorAll('[data-status]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.getAttribute('data-status') === (state.status || 'all')))
        })

        var matched = data.platforms.filter(matches)
        countEl.textContent = 'Showing ' + matched.length + ' of ' + data.total + ' platforms'
        grid.innerHTML = matched.map(cardFor).join('')
        applyBrandColours(grid)
        empty.hidden = matched.length !== 0
      }

      render()
    })()
`
}

/** The catalogue page's hero copy. Plain text with no markup, so each field is
 *  safe to use as HTML text or as a text node. */
export interface PlatformsHero {
  eyebrow: string
  title: string
  lead: string
}

/**
 * The catalogue page split into its parts, for a host that cannot inline them.
 * The opensteward.dev website serves `styles` and `script` as files under a
 * `script-src 'self'; style-src 'self'` CSP and uses `hero.title` as its own
 * page H1. docs-server and the admin keep using renderPlatformsBody(), which
 * assembles these same parts.
 */
export interface PlatformsParts {
  /** The page's CSS text, without a `<style>` wrapper. */
  styles: string
  hero: PlatformsHero
  /** The page markup without the `<style>`, the `<script>` or the hero block:
   *  the `.providers-section` wrapper holding the search, the vertical and
   *  status filters, the count, the grid and the empty state. */
  body: string
  /** The client-side JS, without a `<script>` wrapper. It expects `body`'s
   *  element ids (`q`, `vertical-filters`, `status-filters`, `count`, `grid`,
   *  `empty`) to be in the document when it runs. */
  script: string
}

const HERO: PlatformsHero = {
  eyebrow: 'Platform Library',
  title: 'Every platform, one schema',
  lead: "Browse every integration OpenSteward normalises into its canonical schema. Click through to the Unified API, the platform's website, or official docs.",
}

function heroHtml(hero: PlatformsHero): string {
  return `  <div class="providers-hero">
    <div class="eyebrow">${hero.eyebrow}</div>
    <h1>${hero.title}</h1>
    <p>${hero.lead}</p>
  </div>
`
}

/** Everything inside `.providers-section` after the hero. */
const SECTION_INNER = `  <div class="providers-controls">
    <label class="providers-search">
      <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
      <input type="search" id="q" placeholder="Search by name, slug, country, category…" autocomplete="off" spellcheck="false">
    </label>
    <div class="segmented" id="vertical-filters" role="tablist" aria-label="Filter by vertical"></div>
    <div class="segmented" id="status-filters" role="group" aria-label="Filter by status"></div>
  </div>

  <div class="providers-count" id="count"></div>

  <div class="providers-grid" id="grid"></div>
  <div class="providers-empty" id="empty" hidden>
    <i class="ph ph-binoculars" aria-hidden="true"></i>
    <div>No providers match your search.</div>
  </div>
`

/**
 * The providers catalog page as separate parts: CSS, hero copy, markup and
 * client JS. See PlatformsParts. renderPlatformsBody() is these parts joined.
 */
export function renderPlatformsParts(opts: PlatformsBodyOpts = {}): PlatformsParts {
  const dataUrl = opts.dataUrl ?? '/data/platforms/platforms.json'
  const logoBasePath = (opts.logoBasePath ?? '/data/platforms/logos').replace(/\/$/, '')
  // Default 'none': no logos ship with OpenSteward, and the default install
  // makes no external requests and needs no third-party account.
  const logoSource: LogoSource = opts.logoSource ?? 'none'
  const brandfetchClientId = opts.brandfetchClientId
  const showOverlay = opts.showOverlay ?? false
  const apiTagBase = opts.apiTagBase ?? ''
  const configureBasePath = opts.configureBasePath?.replace(/\/$/, '')
  const guideHrefBase = opts.guideHrefBase?.replace(/\/$/, '')
  const guideHrefTemplate =
    opts.guideHrefTemplate ?? `${guideHrefBase ?? ''}/guides/integrate/{vertical}/{slug}.md`

  return {
    styles: STYLES,
    hero: { ...HERO },
    body: `<section class="providers-section">\n${SECTION_INNER}</section>`,
    script: buildClientScript({
      dataUrl,
      logoBasePath,
      showOverlay,
      apiTagBase,
      configureBasePath,
      guideHrefTemplate,
      logoSource,
      brandfetchClientId,
    }),
  }
}

/**
 * HTML body fragment for the providers catalog page. The host page must already
 * include the OpenSteward design system stylesheets (tokens.css, base.css,
 * components.css) and the Phosphor icon webfont.
 *
 * Built from renderPlatformsParts(): the `<style>`, then the section with the
 * hero inside it, then the `<script>`.
 */
export function renderPlatformsBody(opts: PlatformsBodyOpts = {}): string {
  const parts = renderPlatformsParts(opts)
  return `
<style>${parts.styles}</style>
<section class="providers-section">
${heroHtml(parts.hero)}
${SECTION_INNER}</section>
<script>${parts.script}</script>
`
}
