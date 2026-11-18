/**
 * Declarative inventory of the admin-UI screenshots embedded in markdown
 * under `docs/` and in the README. Each spec runs in a Playwright tab against
 * a logged-in admin session (or, for connect-landing.png, the customer-facing
 * page with no auth). The runner writes the PNG under
 * `docs/assets/screenshots/`.
 *
 * Adding a screenshot:
 *   1. Append an entry below.
 *   2. Run `pnpm docs:screenshots --only <name>` (or the whole set).
 *   3. Embed the PNG with a RELATIVE path, which renders both on GitHub and
 *      on the docs site, e.g. from docs/admin/<page>.md:
 *        ![alt](../assets/screenshots/admin/<name>.png)
 *
 * Replacing a screenshot is mechanical: re-run the script. Re-runs after an
 * admin UI change refresh the docs imagery in one pass.
 *
 * Fields:
 *   - `name` is the spec's id (what `--only` matches) and, unless `output`
 *     overrides it, the PNG path without extension. It may contain `/` to
 *     write into a subfolder (`admin/status` → admin/status.png).
 *   - `theme` is `'light'` when omitted. The run uses one browser context per
 *     colour scheme; the admin follows `prefers-color-scheme` until a user
 *     picks a theme, so no toggling is involved. `'both'` writes
 *     `<output>-light.png` and `<output>-dark.png`.
 *   - `viewport` defaults to 1400×900 (laptop-ish).
 *   - `redact` lists CSS selectors whose text (or input value) is overwritten
 *     with bullets and then blurred before capture — as is anything a
 *     `beforeShot` marks with a `data-shot-redact` attribute. On top of it,
 *     the runner always redacts anything that LOOKS like a credential (long
 *     hex tokens, full osk_/eut_/scim_ keys, Slack/Teams webhook URLs, a
 *     /connect/<token> URL, JWTs), so a page that unexpectedly shows one is
 *     still safe. Use `redact` for values the patterns cannot recognise, such
 *     as an OAuth client id.
 *
 * Never capture a one-time secret: a freshly minted API key, webhook signing
 * secret, MCP token, SCIM token, SQL login, or an unredacted connect-link URL.
 * SQL access and Superset have no screenshots by design.
 */
import type { SeededFixtures } from './seed'

export type ScreenshotTheme = 'light' | 'dark' | 'both'

export interface ScreenshotSpec {
  /** Spec id and, unless `output` is set, the PNG path without extension. */
  name: string
  /** Output path without extension, when it must differ from `name`. */
  output?: string
  /** Target path (leading slash). Resolved against ADMIN_URL (or INTEGRATION_URL when anonymous). */
  url: string | ((seed: SeededFixtures) => string | null)
  /** Colour scheme(s) to capture. Default `'light'`. */
  theme?: ScreenshotTheme
  /** CSS viewport in px. Default 1400×900. */
  viewport?: { width: number; height: number }
  /** Wait for this CSS selector before snapping. */
  waitFor?: string
  /** Extra settle time (ms) after load, for client-rendered charts. */
  settle?: number
  /** CSS selectors to redact before capture (on top of the built-in patterns). */
  redact?: string[]
  /** Optional pre-shot interaction (open dropdown, scroll, fill a field…). */
  beforeShot?: (helpers: ScreenshotHelpers) => Promise<void>
  /**
   * `false` (default) → screenshot the viewport only.
   * `true` → screenshot the full scrollable page.
   * `'element'` → screenshot the element matched by `clipSelector`.
   */
  fullPage?: boolean | 'element'
  clipSelector?: string
  /** When true, do NOT log in before navigating. Used for /connect/:token. */
  anonymous?: boolean
  /** Skip this spec (e.g. while iterating on a different one). */
  skip?: boolean
}

export interface ScreenshotHelpers {
  // Subset of the Playwright Page surface we actually use; keeps this
  // file independent of @playwright/test typing churn.
  click: (selector: string) => Promise<void>
  fill: (selector: string, value: string) => Promise<void>
  hover: (selector: string) => Promise<void>
  evaluate: (fn: () => unknown) => Promise<unknown>
  waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<void>
  waitForTimeout: (ms: number) => Promise<void>
  /**
   * Scroll the first element matching `selector` (and, when given, whose
   * trimmed text equals `text`) to the top of the viewport, minus `offset`
   * px of breathing room. Warns, without failing, when nothing matches.
   */
  scrollTo: (selector: string, opts?: { text?: string; offset?: number }) => Promise<void>
  /** Set an input's value only when it is empty (keeps real data intact). */
  fillIfEmpty: (selector: string, value: string) => Promise<void>
  /** Set an input's value without typing (no input events fire). */
  setValue: (selector: string, value: string) => Promise<void>
}

const ADMIN_VIEWPORT = { width: 1400, height: 900 }

/**
 * The connect-link label autofills from the clock (public/js/
 * connect-link-label.js), so leaving it alone would rewrite the committed PNG
 * on every regeneration and every diff would be a timestamp. Pinned to a
 * stamp in the shape the script actually produces.
 */
async function pinConnectLinkLabel(h: ScreenshotHelpers, label: string): Promise<void> {
  await h.setValue('input[name="label"]', label)
}

export const SCREENSHOT_SPECS: ScreenshotSpec[] = [
  // ── README hero: the Status page, following the reader's theme ──────────
  {
    name: 'admin/status-readme',
    output: 'admin/status',
    url: '/',
    theme: 'both',
    waitFor: '.sidebar__brand',
  },

  // ── Admin console guide (docs/admin/), light only ───────────────────────
  // Overview
  { name: 'admin/status', url: '/', waitFor: '.sidebar__brand' },
  { name: 'admin/dashboards-index', url: '/dashboards', waitFor: 'h1' },
  {
    name: 'admin/dashboard-accounting',
    url: '/dashboards/builtin:accounting',
    waitFor: 'h1',
    settle: 2500,
    viewport: { width: 1400, height: 1200 },
  },
  {
    name: 'admin/dashboard-builder',
    url: (s) => (s.dashboardId ? `/dashboards/${s.dashboardId}/edit` : '/dashboards/new'),
    waitFor: 'input[name="name"]',
    viewport: { width: 1400, height: 1400 },
  },
  { name: 'admin/connections', url: '/connections', waitFor: 'h1' },
  {
    name: 'admin/connection-detail',
    url: (s) => (s.connection ? `/connections/${s.connection.vertical}/${s.connection.id}` : null),
    waitFor: 'h1',
    // Tall enough to take in the whole Sync schedule section below the facts.
    viewport: { width: 1400, height: 1250 },
  },
  { name: 'admin/data-index', url: '/data', waitFor: 'h1' },
  {
    name: 'admin/data-records',
    url: (s) =>
      s.dataConnection
        ? `/data/connections/${s.dataConnection.id}?type=${encodeURIComponent(s.dataConnection.type)}`
        : null,
    waitFor: 'h1',
    // Tall enough to get past the filter form to a page of rows.
    viewport: { width: 1400, height: 1400 },
  },
  {
    name: 'admin/data-record',
    url: (s) =>
      s.dataRecord
        ? `/data/connections/${s.dataRecord.connectionId}/records/${encodeURIComponent(s.dataRecord.type)}/${encodeURIComponent(s.dataRecord.id)}`
        : null,
    waitFor: 'h1',
    viewport: { width: 1400, height: 1100 },
  },

  // Connect
  { name: 'admin/connect-links', url: '/connect-links', waitFor: 'h1' },
  {
    name: 'admin/connect-link-new',
    url: '/connect-links/new',
    waitFor: 'select[name="syncMode"]',
    // The whole form, down to the Sync schedule field near its end.
    fullPage: true,
    beforeShot: async (h) => {
      await pinConnectLinkLabel(h, 'Claims Norway - 2026-01-15 09:30')
    },
  },
  { name: 'admin/link-templates', url: '/connect-link-templates', waitFor: 'h1' },
  {
    name: 'admin/customers',
    url: '/customers',
    waitFor: 'h1',
    // The Email column holds real people's addresses on this deployment.
    redact: ['table tbody td:first-child a[href^="/customers/"]'],
  },
  {
    name: 'admin/customer-detail',
    url: (s) => `/customers/${s.showcaseCustomerId ?? s.customerId}`,
    waitFor: '.card',
    viewport: { width: 1400, height: 1300 },
    // The page is headed by the customer's email address — a real person's on
    // the showcase customer, so it is blurred.
    redact: ['h1'],
  },
  { name: 'admin/sync-jobs', url: '/sync-jobs', waitFor: 'h1' },

  // Admin
  { name: 'admin/platforms', url: '/platforms', waitFor: 'h1' },
  {
    name: 'admin/platform-detail',
    url: (s) =>
      s.connection
        ? `/platforms/${s.connection.vertical}/${s.connection.platform}`
        : '/platforms/accounting/fortnox',
    waitFor: 'h1',
    // An OAuth client id is not a secret, but it is this deployment's own.
    redact: ['#clientId'],
  },
  { name: 'admin/users', url: '/users', waitFor: 'h1' },
  {
    name: 'admin/user-detail',
    url: (s) => (s.userId ? `/users/${s.userId}` : null),
    waitFor: 'h1',
    viewport: { width: 1400, height: 1000 },
    beforeShot: async (h) => {
      // Lead with the tenant-scope editor; the profile cards sit above it.
      await h.scrollTo('h2.card__title', { text: 'Manage account', offset: 40 })
    },
  },
  {
    name: 'admin/role-edit',
    url: (s) => (s.roleId ? `/roles/${s.roleId}` : '/roles/new'),
    waitFor: 'h1',
    viewport: { width: 1400, height: 1200 },
  },
  { name: 'admin/identity-providers', url: '/identity-providers', waitFor: 'h1' },
  {
    name: 'admin/destinations',
    url: (s) => (s.destinationId ? '/destinations' : '/destinations/new'),
    waitFor: 'h1',
  },
  { name: 'admin/api-keys', url: '/api-keys', waitFor: 'h1' },
  {
    name: 'admin/webhooks',
    url: '/webhooks',
    waitFor: 'h1',
    // A subscription URL is often itself a credential (a Slack or Teams
    // incoming-webhook URL). The built-in patterns catch those; this redacts
    // every other real endpoint too, keeping only the fixture's reserved host.
    beforeShot: async (h) => {
      await h.evaluate(() => {
        for (const cell of Array.from(document.querySelectorAll('.webhooks-url'))) {
          if (!cell.textContent?.includes('example.invalid'))
            cell.setAttribute('data-shot-redact', '')
        }
      })
    },
  },
  {
    name: 'admin/webhook-deliveries',
    url: (s) => (s.webhookId ? `/webhooks/${s.webhookId}/deliveries` : null),
    waitFor: 'h1',
  },
  {
    name: 'admin/audit',
    // Filtered to one vertical: unfiltered, the top of the log is mostly the
    // screenshot run's own sign-ins. This also shows the filter row in use.
    url: '/audit?f_vertical=accounting',
    waitFor: 'h1',
  },
  {
    name: 'admin/settings',
    url: '/settings',
    waitFor: 'h2',
    viewport: { width: 1400, height: 1000 },
    beforeShot: async (h) => {
      await h.scrollTo('h2', { text: 'Data store', offset: 40 })
    },
  },
  // Technical details stays closed, as an operator first sees it.
  { name: 'admin/system', url: '/settings/system', waitFor: '[data-release]' },
  { name: 'admin/company', url: '/company-info', waitFor: 'h1' },
  { name: 'admin/notifications', url: '/notifications', waitFor: 'h1' },

  // ── Navigation ──────────────────────────────────────────────────────────
  {
    name: 'admin-sidebar',
    url: '/',
    waitFor: '.sidebar__brand',
    // Tall enough for every sidebar entry, down to System and the build
    // footer, plus the header with the notifications bell.
    viewport: { width: 1400, height: 1100 },
  },

  // ── Setup wizard (8 steps) ──────────────────────────────────────────────
  {
    name: 'wizard-step1-datastore',
    // `?stay=1`: without it the step redirects to wherever setup stands.
    url: '/setup/wizard?stay=1',
    waitFor: '.wizard-shell',
  },
  {
    name: 'wizard-step2-branding',
    url: '/setup/wizard/company-info',
    waitFor: 'input[name="name"]',
    beforeShot: async (h) => {
      // Only fill what the deployment left blank, so real branding stays.
      await h.fillIfEmpty('input[name="name"]', 'Acme Demo')
      await h.fillIfEmpty('input[name="baseUrl"]', 'https://oi.acme.example.com')
    },
  },
  {
    name: 'wizard-step3-logos',
    url: '/setup/wizard/logos',
    waitFor: '.wizard-shell',
    // Brandfetch documents its client id as public, but it is still this
    // deployment's own account.
    redact: ['input[name="brandfetchClientId"]'],
  },
  {
    name: 'wizard-step4-platforms',
    url: '/setup/wizard/platforms',
    waitFor: '.wizard-shell',
  },
  {
    name: 'wizard-step5-credentials',
    // The bare URL resolves to the next adapter missing credentials (else the
    // first enabled one) and renders the credentials form for it.
    url: '/setup/wizard/configure',
    waitFor: '#clientId, .wizard-shell form',
    redact: ['#clientId'],
  },
  {
    name: 'wizard-step6-tenants',
    url: '/setup/wizard/tenants',
    waitFor: '.wizard-shell',
  },
  {
    name: 'wizard-step7-apikey',
    url: '/setup/wizard/api-key',
    waitFor: 'input[name="label"]',
  },
  {
    name: 'wizard-step8-webhooks',
    url: '/setup/wizard/webhooks',
    waitFor: '.wizard-shell',
  },

  // ── Day-2 ops surfaces ──────────────────────────────────────────────────
  {
    name: 'api-keys-mint',
    url: '/api-keys/new',
    waitFor: 'input[name="label"]',
  },
  {
    name: 'customers-detail-mcp',
    url: (seed) => `/customers/${seed.customerId}`,
    waitFor: '.card',
    fullPage: true,
  },
  {
    name: 'settings-openapi',
    url: '/settings',
    waitFor: '.oi-editor',
    beforeShot: async (h) => {
      // The OpenAPI category renders near the end; scroll to its heading so
      // the viewport catches the editor cards rather than the rate-limits
      // table at the top.
      await h.scrollTo('h2', { text: 'OpenAPI / docs', offset: 40 })
    },
  },
  {
    name: 'settings-features',
    url: '/settings',
    waitFor: 'select[name="value"]',
    beforeShot: async (h) => {
      await h.scrollTo('h2', { text: 'Features', offset: 40 })
    },
  },
  {
    name: 'connect-links-new-mode',
    url: '/connect-links/new',
    waitFor: 'select[name="linkMode"]',
    beforeShot: async (h) => {
      // Toggle the linkMode to self-register so the form's downstream
      // fields rearrange — that's the most visually distinct mode.
      await h.evaluate(() => {
        const sel = document.querySelector('select[name="linkMode"]') as HTMLSelectElement | null
        if (sel) {
          sel.value = 'self-register'
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      // Set after the toggle above, because that toggle regenerates it.
      await pinConnectLinkLabel(h, 'Self-register - Acme Ltd - 2026-01-15 09:30')
      await h.waitForTimeout(150)
    },
  },
  {
    name: 'connect-links-just-created',
    // `?link=<id>` spotlights a link and shows its copy-and-send banner.
    url: (seed) => `/connect-links?link=${seed.connectSessionId}`,
    waitFor: '#link-url, .alert--danger',
    // The URL is a bearer credential for the customer's connection. Without
    // a public base URL the banner prints the raw token instead; redact both.
    redact: ['#link-url', '.alert--danger .mono'],
  },
  {
    name: 'scope-groups-list',
    url: '/scope-groups',
    // The cascading platform filter moved into the generic filter row (Task
    // 7 of the admin table sort/filter plan): the old #sg-filter-platform id
    // is gone, absorbed into a plain `<select name="f_platform">` selected
    // by name+form instead. See scope-groups/index.ejs's inline script.
    waitFor: 'select[name="f_platform"]',
  },
  {
    name: 'sync-jobs-list',
    url: '/sync-jobs',
    waitFor: 'h1',
  },
  {
    name: 'tenants-list',
    url: '/tenants',
    waitFor: '#d-domain',
    // Seeded with dept-a / dept-b fixture tenants + .example domains; tall
    // enough that their rows, below the two forms, are in the picture.
    viewport: { width: 1400, height: 1150 },
  },

  // ── Customer-facing ─────────────────────────────────────────────────────
  // /connect/:token has its own URL on integration-server (port 3010); the
  // runner detects `anonymous: true` and uses INTEGRATION_URL instead of
  // ADMIN_URL.
  {
    name: 'connect-landing',
    url: (seed) => `/connect/${seed.connectSessionToken}`,
    anonymous: true,
    waitFor: 'body',
  },
]

/** Default viewport, exported for the runner. */
export const DEFAULT_VIEWPORT = ADMIN_VIEWPORT
