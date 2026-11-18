/**
 * Seed fixture data so the docs screenshots have something to show where
 * the deployment itself has nothing, and look up the ids the specs need
 * (a connection with sync history, a data record, a custom role…).
 *
 * The run captures the stack AS IT IS: real connections, records and users
 * stay in the pictures. A fixture is only created where an area would
 * otherwise render empty or uninformative, and every fixture is marked:
 *
 *   - Tenant id              : "screenshot-fixtures" (customers, links, MCP
 *                              tokens, the webhook subscription)
 *   - Customer email domain  : "screenshot.example.local" (.local never
 *                              resolves, so it visibly reads as fake)
 *   - Names / labels         : suffixed with " (screenshot fixture)"
 *   - Hosts                  : reserved TLDs only (`.example`, `.invalid`)
 *
 * Idempotent: every step looks for its fixture (or for an existing real row
 * that already fills the area) before creating anything, so re-runs reuse
 * what is there. `pnpm docs:screenshots:clean` (clean.ts) removes the
 * fixtures again; they persist between runs by default so the dev admin UI
 * keeps populated pages between regens.
 *
 * Requires the docker stack: admin-api (ADMIN_API_URL, default :3001) and,
 * for the webhook-delivery fixture, integration-server (INTEGRATION_URL,
 * default :3010).
 *
 * Credentials: see `adminCredentials()` below. They are read from the
 * environment or the repo's root `.env` and are only ever sent to the
 * admin-api login endpoint — never logged, never written anywhere.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const ADMIN_API = process.env['ADMIN_API_URL'] ?? 'http://localhost:3001'
export const INTEGRATION_API = process.env['INTEGRATION_URL'] ?? 'http://localhost:3010'
export const FIXTURE_TENANT = 'screenshot-fixtures'
export const FIXTURE_SUFFIX = ' (screenshot fixture)'
export const FIXTURE_EMAIL_DOMAIN = 'screenshot.example.local'
/** Webhook fixture endpoint. `.invalid` never resolves (RFC 2606), so every
 *  delivery fails without a single byte leaving the machine. */
export const FIXTURE_WEBHOOK_URL = 'https://example.invalid/opensteward/webhooks'
/** Fixture tenants (and their `.example` custom domains) for /tenants. */
export const FIXTURE_TENANTS = [
  { id: 'dept-a', name: 'Department A' + FIXTURE_SUFFIX, domain: 'dept-a.acme.example' },
  { id: 'dept-b', name: 'Department B' + FIXTURE_SUFFIX, domain: 'dept-b.acme.example' },
]

// ── Credentials ─────────────────────────────────────────────────────────

/**
 * Parse a dotenv file the way sourcing it would: last assignment wins,
 * optional surrounding quotes stripped. Same rules as e2e/tests/helpers.ts.
 */
function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/**
 * Find the `.env` holding the admin login:
 *   1. `ENV_FILE`, when set (any path).
 *   2. Otherwise walk up from this directory and take the first `.env` that
 *      assigns `ADMIN_USER`. From the main checkout that is the repo root;
 *      from a worktree under `.claude/worktrees/<name>` (which has no `.env`
 *      of its own) the walk continues up to the main checkout's root `.env`.
 */
function findEnvFile(): string | null {
  const explicit = process.env['ENV_FILE']
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`ENV_FILE=${explicit} does not exist`)
    return explicit
  }
  let dir = __dirname
  for (;;) {
    const candidate = path.join(dir, '.env')
    if (existsSync(candidate) && /^\s*ADMIN_USER=/m.test(readFileSync(candidate, 'utf8'))) {
      return candidate
    }
    // Stop at the main checkout (the directory holding the `.git` *directory*;
    // a worktree has a `.git` file and keeps walking up to it) rather than
    // reading a stray .env somewhere above the repository.
    const git = path.join(dir, '.git')
    if (existsSync(git) && statSync(git).isDirectory()) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

let cachedCreds: { user: string; password: string; source: string } | null = null

/**
 * The console login the run uses, resolved once:
 *   user     : ADMIN_USER
 *   password : ADMIN_USER_PASSWORD, falling back to ADMIN_PASS
 * Each variable is taken from the shell environment first, then from the
 * `.env` found by `findEnvFile()`. There is no default: a missing login is
 * an error with instructions, not a silent attempt with a made-up user.
 */
export function adminCredentials(): { user: string; password: string; source: string } {
  if (cachedCreds) return cachedCreds
  const envFile = findEnvFile()
  const file = envFile ? parseEnvFile(envFile) : {}
  // Literal `process.env['…']` reads, not `process.env[key]`: they are how
  // scripts/generate-env-example.ts finds the variables to list in .env.example.
  const shell: Record<string, string | undefined> = {
    ADMIN_USER: process.env['ADMIN_USER'],
    ADMIN_USER_PASSWORD: process.env['ADMIN_USER_PASSWORD'],
    ADMIN_PASS: process.env['ADMIN_PASS'],
  }
  const pick = (key: string): string | undefined => {
    const v = shell[key] ?? file[key]
    return v && v.length > 0 ? v : undefined
  }
  const user = pick('ADMIN_USER')
  const password = pick('ADMIN_USER_PASSWORD') ?? pick('ADMIN_PASS')
  if (!user || !password) {
    throw new Error(
      'No admin login found. Set ADMIN_USER and ADMIN_USER_PASSWORD (or ADMIN_PASS) in the ' +
        "shell, or in the repo root .env (the compose deployment's own), or point ENV_FILE " +
        `at a dotenv file that has them.${envFile ? ` Looked in ${envFile}.` : ' No .env with ADMIN_USER was found above this directory.'}`,
    )
  }
  const fromShell = !!shell['ADMIN_USER'] && !!(shell['ADMIN_USER_PASSWORD'] ?? shell['ADMIN_PASS'])
  cachedCreds = { user, password, source: fromShell ? 'environment' : (envFile ?? 'environment') }
  return cachedCreds
}

// ── HTTP helpers ────────────────────────────────────────────────────────

export interface SeededFixtures {
  tenantId: string
  customerId: string
  customerEmail: string
  scopeGroupId: number | null
  connectSessionToken: string
  connectSessionId: string
  /** Custom dashboard with widgets, for the builder shot. */
  dashboardId: string | null
  /** A custom role, for the role editor shot. */
  roleId: string | null
  /** The fixture webhook subscription (has at least one failed delivery). */
  webhookId: string | null
  /** A destination, or null when none exists and none could be created. */
  destinationId: string | null
  /** A healthy connection with sync history, for the connection detail shot. */
  connection: { id: string; vertical: string; platform: string } | null
  /** A real customer with connections and links, for the customer detail shot. */
  showcaseCustomerId: string | null
  /** Connection + resource type with the most cached rows, for the data viewer. */
  dataConnection: { id: string; type: string } | null
  /** One record (preferring a contact, which carries masked PII). */
  dataRecord: { connectionId: string; type: string; id: string } | null
  /** A non-admin console user, for the user detail shot. */
  userId: string | null
}

export async function login(): Promise<string> {
  const { user, password } = adminCredentials()
  const res = await fetch(`${ADMIN_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password }),
  })
  if (!res.ok) {
    // Status only: the body can echo the username back.
    throw new Error(
      `admin-api login failed (${res.status}) — check ADMIN_USER / ADMIN_USER_PASSWORD`,
    )
  }
  const body = (await res.json()) as { token: string }
  return body.token
}

export function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function getJson<T>(token: string, pathAndQuery: string): Promise<T | null> {
  try {
    const res = await fetch(`${ADMIN_API}${pathAndQuery}`, { headers: authHeaders(token) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function postJson<T>(
  token: string,
  pathAndQuery: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const res = await fetch(`${ADMIN_API}${pathAndQuery}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) return { ok: false, status: res.status, text: (await res.text()).slice(0, 300) }
  return { ok: true, data: (await res.json()) as T }
}

async function deleteQuiet(token: string, pathAndQuery: string): Promise<boolean> {
  try {
    const res = await fetch(`${ADMIN_API}${pathAndQuery}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    return res.ok || res.status === 204
  } catch {
    return false
  }
}

// ── Customer, MCP token, scope group, connect link (original fixtures) ──

async function findExistingCustomer(token: string, email: string): Promise<string | null> {
  // /api/end-users is the API name; the admin UI labels it "Customers".
  const body = await getJson<{ data: Array<{ id: string; email: string }> }>(
    token,
    `/api/end-users?tenantId=${encodeURIComponent(FIXTURE_TENANT)}`,
  )
  return body?.data?.find((c) => c.email === email)?.id ?? null
}

async function seedCustomer(token: string): Promise<{ id: string; email: string }> {
  const email = `acme-demo@${FIXTURE_EMAIL_DOMAIN}`
  const existing = await findExistingCustomer(token, email)
  if (existing) return { id: existing, email }
  const res = await postJson<{ data: { id: string } }>(token, '/api/end-users', {
    tenantId: FIXTURE_TENANT,
    email,
    displayName: 'Acme Demo' + FIXTURE_SUFFIX,
    externalReference: 'demo-acme-001',
  })
  if (!res.ok) throw new Error(`seed customer failed: ${res.status} ${res.text}`)
  return { id: res.data.data.id, email }
}

async function ensureMcpTokenForCustomer(token: string, customerId: string): Promise<void> {
  // Mint one end-user token (mcp:read) so the per-customer MCP tokens panel
  // has a row. The plaintext comes back once on mint; it is discarded
  // unread — only the row (prefix, label, scopes) is ever displayed.
  const list = await getJson<{ data?: Array<{ id: string; revokedAt?: number | null }> }>(
    token,
    `/api/end-user-tokens?endUserId=${encodeURIComponent(customerId)}`,
  )
  if (list?.data?.some((t) => !t.revokedAt)) return
  const res = await postJson(token, '/api/end-user-tokens', {
    endUserId: customerId,
    tenantId: FIXTURE_TENANT,
    label: 'Claude Desktop demo' + FIXTURE_SUFFIX,
    scopes: ['mcp:read'],
  })
  if (!res.ok) console.warn(`[seed]   MCP token mint skipped (${res.status})`)
}

async function seedScopeGroup(token: string): Promise<number | null> {
  const name = 'Read-only accounting' + FIXTURE_SUFFIX
  const list = await getJson<{ data?: Array<{ id: number; name: string }> }>(
    token,
    '/api/scope-groups',
  )
  const existing = list?.data?.find((g) => g.name === name)
  if (existing) return existing.id
  const res = await postJson<{ data: { id: number } }>(token, '/api/scope-groups', {
    vertical: 'accounting',
    platform: 'fortnox',
    name,
    scopes: ['offline_access', 'invoice', 'bookkeeping'],
  })
  if (!res.ok) {
    console.warn(`[seed]   scope-group seed skipped (${res.status})`)
    return null
  }
  return res.data.data.id
}

const SESSION_LABEL = 'Acme demo connect link' + FIXTURE_SUFFIX

async function seedConnectSession(
  token: string,
  customerId: string,
): Promise<{ id: string; token: string }> {
  // Idempotent: re-runs reuse the live fixture session so the customer
  // doesn't accumulate one new active session per regen. The just-created
  // banner screenshot stays valid — /connect-links?link=<id> renders the
  // banner for any session, not just freshly-minted ones.
  const list = await getJson<{
    data?: Array<{ id: string; token: string; label: string; status?: string }>
  }>(
    token,
    `/api/connect-sessions?tenantId=${encodeURIComponent(FIXTURE_TENANT)}&endUserId=${encodeURIComponent(customerId)}`,
  )
  const existing = list?.data?.find(
    (s) => s.label === SESSION_LABEL && s.status !== 'expired' && s.status !== 'consumed',
  )
  if (existing) {
    console.log('[seed]   (reusing existing fixture session)')
    return { id: existing.id, token: existing.token }
  }
  const res = await postJson<{ data: { id: string; token: string } }>(
    token,
    '/api/connect-sessions',
    {
      tenantId: FIXTURE_TENANT,
      label: SESSION_LABEL,
      endUserId: customerId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      allowSelfRegister: false,
    },
  )
  if (!res.ok) throw new Error(`seed connect-session failed: ${res.status} ${res.text}`)
  return res.data.data
}

/**
 * Fixture tenants + custom domains so /tenants has populated rows. Domains
 * use the reserved `.example` TLD so they visibly read as fixtures.
 */
async function seedTenantsAndDomains(token: string): Promise<void> {
  const tenants = await getJson<{ data?: Array<{ id: string }> }>(token, '/api/tenants')
  const domains = await getJson<{ data?: Array<{ domain: string }> }>(token, '/api/tenant-domains')
  const existingTenants = new Set((tenants?.data ?? []).map((t) => t.id))
  const existingDomains = new Set((domains?.data ?? []).map((d) => d.domain))
  for (const t of FIXTURE_TENANTS) {
    if (!existingTenants.has(t.id)) {
      const res = await postJson(token, '/api/tenants', { id: t.id, name: t.name })
      if (!res.ok) {
        console.warn(`[seed]   tenant seed skipped (${res.status})`)
        continue
      }
    }
    if (!existingDomains.has(t.domain)) {
      const res = await postJson(token, '/api/tenant-domains', { domain: t.domain, tenantId: t.id })
      if (!res.ok) console.warn(`[seed]   tenant-domain seed skipped (${res.status})`)
    }
  }
}

// ── Fixtures for the admin console guide ────────────────────────────────

const DASHBOARD_NAME = 'Cash and receivables' + FIXTURE_SUFFIX

/**
 * A custom dashboard with widgets, for the builder shot. Reuses the fixture,
 * or any custom dashboard that already has a few widgets; only creates one
 * when the deployment has no custom dashboard worth showing (an empty one
 * renders "No widgets yet", which illustrates nothing). Private, so nobody
 * else on the deployment sees it.
 */
async function seedDashboard(token: string): Promise<string | null> {
  const list = await getJson<{
    data?: Array<{ id: string; name: string; builtin: boolean; widgets?: unknown[] }>
  }>(token, '/api/dashboards')
  const custom = (list?.data ?? []).filter((d) => !d.builtin)
  const fixture = custom.find((d) => d.name === DASHBOARD_NAME)
  if (fixture) return fixture.id
  const populated = custom.find((d) => (d.widgets?.length ?? 0) >= 4)
  if (populated) return populated.id
  const res = await postJson<{ data: { id: string } }>(token, '/api/dashboards', {
    name: DASHBOARD_NAME,
    description: 'What is owed to us, what came in, and how it is trending.',
    audience: { kind: 'private' },
    widgets: [
      { metricId: 'accounting.revenue', chart: 'number', width: 4, compare: true },
      { metricId: 'accounting.outstanding_amount', chart: 'number', width: 4 },
      { metricId: 'accounting.avg_invoice_value', chart: 'number', width: 4 },
      { metricId: 'accounting.revenue_per_month', chart: 'bar', width: 6 },
      { metricId: 'accounting.invoices_by_status', chart: 'pie', width: 6 },
      { metricId: 'accounting.cash_in_per_month', chart: 'bar', width: 12, title: 'Cash in' },
    ],
  })
  if (!res.ok) {
    console.warn(`[seed]   dashboard seed skipped (${res.status}): ${res.text}`)
    return custom[0]?.id ?? null
  }
  return res.data.data.id
}

const ROLE_NAME = 'Finance analyst' + FIXTURE_SUFFIX

/** A custom role for the role editor shot; reuses any existing custom role. */
async function seedRole(token: string): Promise<string | null> {
  const list = await getJson<{ data?: Array<{ id: string; name: string; isBuiltin: boolean }> }>(
    token,
    '/api/roles',
  )
  const custom = (list?.data ?? []).filter((r) => !r.isBuiltin)
  const existing = custom.find((r) => r.name === ROLE_NAME) ?? custom[0]
  if (existing) return existing.id
  const res = await postJson<{ data: { id: string } }>(token, '/api/roles', {
    name: ROLE_NAME,
    description: 'Reads dashboards and synced records, and exports them. No PII, no settings.',
    baseRole: 'viewer',
    permissions: ['connections:read', 'dashboards:view', 'data:read', 'data:export'],
  })
  if (!res.ok) {
    console.warn(`[seed]   role seed skipped (${res.status}): ${res.text}`)
    return null
  }
  return res.data.data.id
}

const WEBHOOK_LABEL = 'Order sync service' + FIXTURE_SUFFIX
const TRIGGER_KEY_LABEL = 'Webhook delivery trigger' + FIXTURE_SUFFIX

/**
 * A webhook subscription to `https://example.invalid/…` with at least one
 * failed delivery, so /webhooks/:id/deliveries shows a real failure row.
 *
 * Only a real event creates a delivery row (the admin "Send test" writes
 * none), and the events a fixture can cause are the developer API's
 * `customer.*`. So, when the subscription has no deliveries yet, this mints
 * a short-lived fixture API key for the fixture tenant, creates (and then
 * deletes) one throwaway customer through `/v1/customers`, and revokes the
 * key straight away. The key's plaintext lives only in this function's
 * memory; the subscription's signing secret, returned once at create time,
 * is discarded unread.
 */
async function seedWebhook(token: string): Promise<string | null> {
  const list = await getJson<{ data?: Array<{ id: string; label: string | null }> }>(
    token,
    `/api/webhook-subscriptions?tenantId=${encodeURIComponent(FIXTURE_TENANT)}`,
  )
  let id = list?.data?.find((s) => s.label === WEBHOOK_LABEL)?.id ?? null
  if (!id) {
    const res = await postJson<{ data: { id: string } }>(token, '/api/webhook-subscriptions', {
      tenantId: FIXTURE_TENANT,
      url: FIXTURE_WEBHOOK_URL,
      label: WEBHOOK_LABEL,
      events: ['customer.created', 'customer.updated', 'customer.deleted'],
      format: 'opensteward',
    })
    if (!res.ok) {
      console.warn(`[seed]   webhook seed skipped (${res.status}): ${res.text}`)
      return null
    }
    id = res.data.data.id
  }

  const deliveries = await getJson<{ data?: unknown[] }>(
    token,
    `/api/webhook-subscriptions/${encodeURIComponent(id)}/deliveries`,
  )
  if ((deliveries?.data?.length ?? 0) > 0) return id

  const minted = await postJson<{ data: { id: string; plaintext: string } }>(
    token,
    '/api/api-keys',
    {
      tenantId: FIXTURE_TENANT,
      label: TRIGGER_KEY_LABEL,
      scopes: ['customers:write'],
      expiresAt: Date.now() + 10 * 60 * 1000,
    },
  )
  if (!minted.ok) {
    console.warn(`[seed]   webhook delivery trigger skipped: key mint ${minted.status}`)
    return id
  }
  const keyId = minted.data.data.id
  try {
    const res = await fetch(`${INTEGRATION_API}/v1/customers`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${minted.data.data.plaintext}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: `webhook-demo-${Date.now()}@${FIXTURE_EMAIL_DOMAIN}`,
        displayName: 'Webhook demo' + FIXTURE_SUFFIX,
      }),
    })
    if (res.ok) {
      const created = (await res.json()) as { data?: { id?: string } }
      // The delivery row is what the shot needs; the customer is not.
      if (created.data?.id) {
        await deleteQuiet(token, `/api/end-users/${encodeURIComponent(created.data.id)}`)
      }
    } else {
      console.warn(`[seed]   webhook delivery trigger: /v1/customers answered ${res.status}`)
    }
  } finally {
    await deleteQuiet(token, `/api/api-keys/${encodeURIComponent(keyId)}`)
  }
  return id
}

const DESTINATION_NAME = 'Data lake export' + FIXTURE_SUFFIX

/**
 * A disabled S3 destination when the deployment has none. Disabled, with no
 * credentials, so it never runs and nothing is ever written anywhere;
 * creating it performs no connectivity test.
 */
async function seedDestination(token: string): Promise<string | null> {
  const list = await getJson<{ data?: Array<{ id: string; name: string }> }>(
    token,
    '/api/destinations',
  )
  const rows = list?.data ?? []
  const existing = rows.find((d) => d.name === DESTINATION_NAME) ?? rows[0]
  if (existing) return existing.id
  const res = await postJson<{ data: { id: string } }>(token, '/api/destinations', {
    name: DESTINATION_NAME,
    type: 's3',
    config: { bucket: 'acme-lake-example', region: 'eu-west-1', prefix: 'opensteward/' },
    scope: { tenants: '*' },
    intervalSec: 3600,
    enabled: false,
  })
  if (!res.ok) {
    console.warn(`[seed]   destination seed skipped (${res.status}): ${res.text}`)
    return null
  }
  return res.data.data.id
}

const TEMPLATE_NAME = 'Accounting onboarding' + FIXTURE_SUFFIX

/** A connect-link template when the deployment has none. */
async function seedLinkTemplate(token: string): Promise<void> {
  const list = await getJson<{ data?: Array<{ id: string; name: string }> }>(
    token,
    '/api/connect-link-templates',
  )
  if ((list?.data ?? []).length > 0) return
  const res = await postJson(token, '/api/connect-link-templates', {
    tenantId: FIXTURE_TENANT,
    name: TEMPLATE_NAME,
    description: 'Customer picks their accounting system; links last a week.',
    linkMode: 'customer-picks-adapter',
    allowedVerticals: ['accounting'],
    expiryDays: 7,
    oneTimeOnly: false,
  })
  if (!res.ok) console.warn(`[seed]   link-template seed skipped (${res.status}): ${res.text}`)
}

// ── Look-ups (read-only) ────────────────────────────────────────────────

interface ConnectionRow {
  id: string
  vertical: string
  platform: string
  status: string
  sync?: { lastStatus?: string | null; consecutiveFailures?: number; lastSyncedAt?: number | null }
}

interface DataSummaryRow {
  connectionId: string
  vertical: string
  platform: string
  resources: Array<{ resourceType: string; count: number }>
}

/**
 * Pick the connection for the detail shot: valid, and whose last sync
 * completed with no failures since. That skips a connection that is
 * currently failing (on the reference stack, the xero one that 403s), whose
 * page would document an error instead of the schedule.
 */
async function pickConnection(token: string): Promise<SeededFixtures['connection']> {
  const conns = (await getJson<{ data?: ConnectionRow[] }>(token, '/api/connections'))?.data ?? []
  const healthy = conns.filter(
    (c) =>
      c.status === 'valid' &&
      c.sync?.lastStatus === 'completed' &&
      (c.sync.consecutiveFailures ?? 0) === 0,
  )
  const preferred = ['accounting', 'ecommerce', 'payments', 'crm']
  const rank = (v: string) => (preferred.indexOf(v) < 0 ? 99 : preferred.indexOf(v))
  healthy.sort((a, b) => rank(a.vertical) - rank(b.vertical))
  const c = healthy[0] ?? conns[0]
  return c ? { id: c.id, vertical: c.vertical, platform: c.platform } : null
}

/**
 * The customer with the most connect links (and so, usually, connections),
 * for the customer detail shot. Fixture customers are skipped — they have
 * links but never a connection.
 */
async function pickCustomer(token: string): Promise<string | null> {
  const sessions =
    (
      await getJson<{ data?: Array<{ endUserId: string | null; tenantId: string }> }>(
        token,
        '/api/connect-sessions',
      )
    )?.data ?? []
  const counts = new Map<string, number>()
  for (const s of sessions) {
    if (!s.endUserId || s.tenantId === FIXTURE_TENANT) continue
    counts.set(s.endUserId, (counts.get(s.endUserId) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [id, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = id
  return best
}

/**
 * Data viewer targets. A table with one row illustrates nothing, so the
 * records shot takes the first of a few familiar resource types that some
 * connection holds at least ten of (invoices before orders before
 * contacts…), from whichever connection holds the most. Cached data reads
 * fine even from a connection whose latest sync failed. The record shot
 * takes a contact (or customer) — it carries PII, which is what the masking
 * is about — from the connection with the most of them.
 */
async function pickData(token: string): Promise<{
  dataConnection: SeededFixtures['dataConnection']
  dataRecord: SeededFixtures['dataRecord']
}> {
  const summary = await getJson<{ data?: DataSummaryRow[] }>(token, '/api/data/summary')
  const rows = summary?.data ?? []
  const busiest = (type: string): { id: string; count: number } | null => {
    let best: { id: string; count: number } | null = null
    for (const r of rows) {
      const n = r.resources.find((x) => x.resourceType === type)?.count ?? 0
      if (n > 0 && (best === null || n > best.count)) best = { id: r.connectionId, count: n }
    }
    return best
  }

  const typeOrder = ['invoices', 'orders', 'contacts', 'customers', 'products', 'accounts']
  let dataConnection: SeededFixtures['dataConnection'] = null
  for (const minRows of [10, 1]) {
    for (const type of typeOrder) {
      const hit = busiest(type)
      if (hit && hit.count >= minRows) {
        dataConnection = { id: hit.id, type }
        break
      }
    }
    if (dataConnection) break
  }

  let dataRecord: SeededFixtures['dataRecord'] = null
  for (const type of ['contacts', 'customers']) {
    const hit = busiest(type)
    if (!hit) continue
    const page = await getJson<{ data?: Array<{ id?: string }> }>(
      token,
      `/api/data/connections/${encodeURIComponent(hit.id)}/resources/${type}?limit=5`,
    )
    const rid = page?.data?.[0]?.id
    if (rid) {
      dataRecord = { connectionId: hit.id, type, id: rid }
      break
    }
  }
  return { dataConnection, dataRecord }
}

async function pickUser(token: string): Promise<string | null> {
  const list = await getJson<{ data?: Array<{ id: string; role: string }> }>(token, '/api/users')
  const users = list?.data ?? []
  return (users.find((u) => u.role !== 'admin') ?? users[0])?.id ?? null
}

// ── Entry point ─────────────────────────────────────────────────────────

export async function seedFixtures(): Promise<SeededFixtures> {
  const creds = adminCredentials()
  console.log(`[seed] logging in to admin-api (credentials from ${creds.source})…`)
  const jwt = await login()

  console.log('[seed] customer…')
  const customer = await seedCustomer(jwt)
  console.log(`[seed]   id=${customer.id}`)

  console.log('[seed] MCP token on customer…')
  await ensureMcpTokenForCustomer(jwt, customer.id)

  console.log('[seed] scope group…')
  const scopeGroupId = await seedScopeGroup(jwt)

  console.log('[seed] connect session…')
  const session = await seedConnectSession(jwt, customer.id)
  console.log(`[seed]   id=${session.id}`)

  console.log('[seed] tenants + custom domains…')
  await seedTenantsAndDomains(jwt)

  console.log('[seed] custom dashboard…')
  const dashboardId = await seedDashboard(jwt)

  console.log('[seed] custom role…')
  const roleId = await seedRole(jwt)

  console.log('[seed] webhook subscription + failed delivery…')
  const webhookId = await seedWebhook(jwt)

  console.log('[seed] destination…')
  const destinationId = await seedDestination(jwt)

  console.log('[seed] connect-link template…')
  await seedLinkTemplate(jwt)

  console.log('[seed] looking up connection, data and user targets…')
  const connection = await pickConnection(jwt)
  const { dataConnection, dataRecord } = await pickData(jwt)
  const userId = await pickUser(jwt)
  const showcaseCustomerId = await pickCustomer(jwt)

  return {
    tenantId: FIXTURE_TENANT,
    customerId: customer.id,
    customerEmail: customer.email,
    scopeGroupId,
    connectSessionId: session.id,
    connectSessionToken: session.token,
    dashboardId,
    roleId,
    webhookId,
    destinationId,
    connection,
    showcaseCustomerId,
    dataConnection,
    dataRecord,
    userId,
  }
}

// Run directly:
//   pnpm --filter admin exec tsx scripts/screenshots/seed.ts
if (require.main === module) {
  seedFixtures().then(
    (out) => {
      console.log('[seed] done')
      // The connect-session token is a bearer credential: never print it.
      console.log(JSON.stringify({ ...out, connectSessionToken: '(hidden)' }, null, 2))
    },
    (err) => {
      console.error('[seed] failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    },
  )
}
