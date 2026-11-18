/**
 * The wizard's webhook step and /webhooks are the same form.
 *
 * Both surfaces render views/webhooks/_subscription-fields.ejs and share
 * views/webhook-subscription-input.ts, so the tests here are mostly about
 * making divergence impossible to introduce: what one form offers, the other
 * offers. A wizard copy of the form would drift — destination formats, custom
 * headers, event types, the HTTPS check — and the setup path is the one a
 * brand-new operator is most likely to take.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListTenants = vi.fn(async () => [{ id: 'default', name: 'Default' }])
const mockUpdateWebhookSub = vi.fn(async () => ({}))
const mockListWebhookSubs = vi.fn()
const mockCreateWebhookSub = vi.fn()
const mockRotateWebhookSubSecret = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: mockListTenants,
      updateWebhookSub: mockUpdateWebhookSub,
      listWebhookSubs: mockListWebhookSubs,
      createWebhookSub: mockCreateWebhookSub,
      rotateWebhookSubSecret: mockRotateWebhookSubSecret,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      // `get*` defaults to null, but this one is a list.
      getVerticals: async () => [],
      getDataStoreMetrics: async () => ({
        mode: 'database',
        rows: { total: 0 },
        db_size_mb: 0,
        sync_jobs: {},
      }),
      // getCompanyInfo, listAllPlatformRows, listConnections and listApiKeys
      // are left to the read defaults.
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'wizard-webhook-parity-session-secret-long-enough'

const SUB = {
  id: 'whs_1',
  tenantId: 'default',
  url: 'https://hooks.acme.example/billing',
  label: 'Billing service',
  events: ['*'],
  paused: false,
  createdAt: '2026-08-01T09:00:00.000Z',
  lastFiredAt: null,
  lastStatus: null,
  lastError: null,
  format: 'opensteward',
  headerNames: [],
}

let fastify: FastifyInstance

beforeEach(async () => {
  // Reset like every other mock here. Without it a `mockResolvedValue(TWO)` in
  // one test leaks into all the later ones.
  mockListTenants.mockReset().mockResolvedValue([{ id: 'default', name: 'Default' }])
  mockUpdateWebhookSub.mockReset().mockResolvedValue({})
  mockListWebhookSubs.mockReset().mockResolvedValue([SUB])
  mockCreateWebhookSub.mockReset().mockResolvedValue({ ...SUB, secret: 'whsec_plaintext_once' })
  mockRotateWebhookSubSecret.mockReset().mockResolvedValue('whsec_rotated_plaintext')
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

function get(url: string, role = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie(role) } })
}

async function post(url: string, payload: Record<string, string>, formUrl: string) {
  const session = cookie('admin')
  const page = await fastify.inject({ method: 'GET', url: formUrl, cookies: { session } })
  const token = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? ''
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session },
    payload: { _csrf: token, ...payload },
  })
}

/** Every event value the page offers as a checkbox. */
function eventValues(body: string): string[] {
  return [...body.matchAll(/name="events" value="([^"]+)"/g)].map((m) => m[1]).sort()
}

describe('the wizard step offers what the standalone form offers', () => {
  it('exposes the payload format, with all four destinations', async () => {
    const res = await get('/setup/wizard/webhooks')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="format"')
    for (const value of ['opensteward', 'slack', 'teams', 'flat']) {
      expect(res.body).toContain(`value="${value}"`)
    }
  })

  it('exposes the custom-headers field', async () => {
    const res = await get('/setup/wizard/webhooks')
    expect(res.body).toContain('name="headers"')
  })

  it('exposes a label field', async () => {
    const res = await get('/setup/wizard/webhooks')
    expect(res.body).toContain('name="label"')
  })

  it('offers exactly the same event catalogue as /webhooks/new', async () => {
    // Drift here is silent: a missing checkbox means an event cannot be
    // subscribed to during setup and nothing says so.
    const wizard = await get('/setup/wizard/webhooks')
    const standalone = await get('/webhooks/new')
    expect(eventValues(wizard.body)).toEqual(eventValues(standalone.body))
    expect(eventValues(wizard.body)).toContain('platform.event')
    expect(eventValues(wizard.body)).toContain('connection.authorization_expired')
  })

  it('keeps the delivery settings out of the way but reachable', async () => {
    // "Reduced by default" has to mean collapsed, not absent — a <details>
    // the operator can open, in the same page, with the same field names.
    const res = await get('/setup/wizard/webhooks')
    expect(res.body).toMatch(/<details[^>]*>[\s\S]*name="format"/)
  })
})

describe('what the wizard step posts reaches the API', () => {
  const base = {
    url: 'https://hooks.slack.com/services/T0/B0/xxx',
    eventMode: 'all',
  }

  it('sends the label, format and parsed headers', async () => {
    const res = await post(
      '/setup/wizard/webhooks',
      {
        ...base,
        tenantId: 'default',
        label: 'Ops channel',
        format: 'slack',
        headers: 'X-Api-Key: k-123',
      },
      '/setup/wizard/webhooks',
    )
    expect(res.statusCode).toBe(200)
    expect(mockCreateWebhookSub).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({
        label: 'Ops channel',
        format: 'slack',
        headers: { 'X-Api-Key': 'k-123' },
      }),
    )
  })

  it('stores no label rather than an empty one when the field is left blank', async () => {
    await post(
      '/setup/wizard/webhooks',
      { ...base, tenantId: 'default', label: '   ', format: 'opensteward', headers: '' },
      '/setup/wizard/webhooks',
    )
    expect(mockCreateWebhookSub).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ label: null, headers: undefined }),
    )
  })

  it('reports a malformed header line instead of dropping the credential', async () => {
    const res = await post(
      '/setup/wizard/webhooks',
      { ...base, tenantId: 'default', format: 'opensteward', headers: 'not-a-header' },
      '/setup/wizard/webhooks',
    )
    expect(res.body).toMatch(/Line 1 is not a header/)
    expect(mockCreateWebhookSub).not.toHaveBeenCalled()
  })

  it('refuses a plain-http endpoint, exactly as /webhooks does', async () => {
    const res = await post(
      '/setup/wizard/webhooks',
      { url: 'http://hooks.acme.example/oi', eventMode: 'all', tenantId: 'default' },
      '/setup/wizard/webhooks',
    )
    expect(res.body).toMatch(/must use HTTPS/i)
    expect(mockCreateWebhookSub).not.toHaveBeenCalled()
  })

  it('still allows http://localhost, which is how it is tried locally', async () => {
    const res = await post(
      '/setup/wizard/webhooks',
      { url: 'http://localhost:4000/oi', eventMode: 'all', tenantId: 'default' },
      '/setup/wizard/webhooks',
    )
    expect(res.statusCode).toBe(200)
    expect(mockCreateWebhookSub).toHaveBeenCalled()
  })

  it('keeps the operator’s typing when it rejects the form', async () => {
    const res = await post(
      '/setup/wizard/webhooks',
      {
        url: 'http://hooks.acme.example/oi',
        eventMode: 'all',
        tenantId: 'default',
        label: 'Ops channel',
        format: 'teams',
        headers: 'X-Api-Key: k-123',
      },
      '/setup/wizard/webhooks',
    )
    expect(res.body).toContain('Ops channel')
    expect(res.body).toContain('X-Api-Key: k-123')
    expect(res.body).toMatch(/value="teams" selected/)
  })
})

describe('the secret is shown once, and says which subscription it belongs to', () => {
  it('shows the plaintext with a copy control after a wizard create', async () => {
    const res = await post(
      '/setup/wizard/webhooks',
      { url: 'https://hooks.acme.example/oi', eventMode: 'all', tenantId: 'default' },
      '/setup/wizard/webhooks',
    )
    expect(res.body).toContain('whsec_plaintext_once')
    expect(res.body).toContain('data-copy="whsec_plaintext_once"')
    expect(res.body).toMatch(/Save the secret before navigating away/i)
  })

  it('shows the rotated plaintext with a copy control', async () => {
    const res = await post('/webhooks/whs_1/rotate-secret', {}, '/webhooks')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('whsec_rotated_plaintext')
    expect(res.body).toContain('data-copy="whsec_rotated_plaintext"')
    expect(res.body).toMatch(/Save the secret before navigating away/i)
  })

  it('names the rotated subscription rather than only its id', async () => {
    // A bare UUID beside a live signing secret tells an operator running a
    // dozen of these nothing about which endpoint they just cut off — the
    // panel names the subscription.
    const res = await post('/webhooks/whs_1/rotate-secret', {}, '/webhooks')
    expect(res.body).toContain('Billing service')
    expect(res.body).toContain('https://hooks.acme.example/billing')
    expect(res.body).toMatch(/New webhook signing secret/i)
  })

  it('still shows the secret when the row vanished between rotate and list', async () => {
    // The secret is the answer to what the operator asked; losing it because
    // someone else deleted the subscription would be the worse failure.
    const session = cookie('admin')
    // Token first, from the page that still lists the row — the empty list
    // renders an empty state with no form, and so no CSRF token to read.
    const page = await fastify.inject({ method: 'GET', url: '/webhooks', cookies: { session } })
    const token = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? ''
    mockListWebhookSubs.mockResolvedValue([])
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/whs_1/rotate-secret',
      cookies: { session },
      payload: { _csrf: token },
    })
    expect(res.body).toContain('whsec_rotated_plaintext')
    expect(res.body).toContain('whs_1')
  })

  it('never puts the secret in a redirect, where req.url would log it', async () => {
    const res = await post('/webhooks/whs_1/rotate-secret', {}, '/webhooks')
    expect(res.statusCode).toBe(200)
    expect(res.headers.location).toBeUndefined()
  })
})

/**
 * The above-table search box this describe block used to pin was absorbed
 * into the generic per-column filter row (admin table sort/filter, Task 7):
 * `name="search"` became the Label column's `name="f_label"` control, with
 * `search` kept working as a `legacy` alias rather than a distinct upstream
 * API parameter — see routes/webhooks.ts's WEBHOOKS_TABLE. Filtering moved
 * client-side, matching every other absorbed table in this rollout
 * (users.ts, oauth-clients.ts, connect-links.ts), so the old
 * "passes X to the API" contract is now "filters what came back".
 */
describe('the webhooks list is filterable by label', () => {
  it('offers a filter box for the Label column', async () => {
    const res = await get('/webhooks')
    expect(res.body).toContain('name="f_label"')
  })

  it('filters the rendered page by label, client-side', async () => {
    mockListWebhookSubs.mockResolvedValue([
      SUB,
      {
        ...SUB,
        id: 'whs_2',
        label: 'Shipping service',
        url: 'https://hooks.acme.example/shipping',
      },
    ])
    const res = await get('/webhooks?f_label=Shipping')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Shipping service')
    expect(body).not.toContain('Billing service')
  })

  it('still honours the old ?search= URL as a Label filter, trimmed', async () => {
    mockListWebhookSubs.mockResolvedValue([
      SUB,
      {
        ...SUB,
        id: 'whs_2',
        label: 'Shipping service',
        url: 'https://hooks.acme.example/shipping',
      },
    ])
    const res = await get('/webhooks?search=%20Shipping%20')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Shipping service')
    expect(body).not.toContain('Billing service')
  })

  it('composes the label filter with the tenant filter, which still goes upstream', async () => {
    mockListWebhookSubs.mockResolvedValue([
      { ...SUB, tenantId: 'acme' },
      {
        ...SUB,
        id: 'whs_2',
        tenantId: 'acme',
        label: 'Shipping service',
        url: 'https://hooks.acme.example/shipping',
      },
    ])
    const res = await get('/webhooks?search=billing&tenantId=acme')
    // Tenant scoping is still pushed upstream, same as before absorption —
    // only its source moved from `request.query.tenantId` to
    // `tableState.filters.tenant`.
    expect(mockListWebhookSubs).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'acme' }),
    )
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('Billing service')
    expect(body).not.toContain('Shipping service')
  })

  it('shows the label in the list', async () => {
    const res = await get('/webhooks')
    expect(res.body).toContain('Billing service')
  })

  it('says Unnamed rather than nothing for a subscription with no label', async () => {
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, label: null }])
    const res = await get('/webhooks')
    expect(res.body).toContain('Unnamed')
  })

  it('says Unnamed even when filtering by the Label column for it', async () => {
    // Regression pin: the Label cell falls back to 'Unnamed' when the field
    // is empty, so the accessor must reproduce that fallback or this row
    // would be unreachable by the one word actually on screen for it.
    //
    // Must-fix 3: a bare `toContain('Unnamed')` here cannot fail. Under the
    // very regression this test claims to pin — the accessor reading bare
    // `s.label` instead of `s.label || 'Unnamed'` — the row is filtered out,
    // `subs.length` is 0, and webhooks/index.ejs's OWN empty-state branch
    // renders `No webhook matches "Unnamed"` (it echoes
    // `tableState.filters.label`, which IS the literal string 'Unnamed')
    // inside that same <tbody> — so the old assertion passed either way.
    // Asserting the actual cell markup, plus that no empty-state rendered at
    // all, is what makes this fail against the reverted accessor. Proven by
    // reverting routes/webhooks.ts's Label `get` to `(s: any) => s.label`,
    // running this test (fails), and restoring it (passes) — see the fix
    // wave's report for both runs.
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, label: null }])
    const res = await get('/webhooks?f_label=Unnamed')
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).toContain('<span class="muted">Unnamed</span>')
    expect(body).not.toContain('empty-state')
  })

  it('explains an empty result as a search miss, not as an empty install', async () => {
    // Restored, fix-round-1 Critical 2: the prior round weakened this to a
    // bare `toContain('empty-state')`, which the WRONG empty state (the
    // "No webhooks configured" first-run CTA, with no Clear control) also
    // satisfies — that weakening is exactly why the regression it exists to
    // catch went undetected. This is the original assertion, restored:
    // against the pre-fix markup (the table hidden entirely whenever
    // `subs.length === 0`, with one unconditional "No webhooks configured"
    // message), it fails — `/No webhook matches/` never appears, and
    // `/No webhooks configured/` does.
    mockListWebhookSubs.mockResolvedValue([SUB])
    const res = await get('/webhooks?search=nothing-matches')
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/No webhook matches/)
    expect(res.body).not.toMatch(/No webhooks configured/)
  })
})

/**
 * Which tenant a subscription created during setup belongs to.
 *
 * Scoping itself is not in question — `matching(tenantId, event)` filters on
 * `tenant_id`, so a subscription only ever receives its own tenant's events.
 * This screen must offer the tenant choice — pinning it to `default` in a
 * hidden field would mean a subscription made during setup cannot serve a
 * tenant the operator created on the step immediately before it.
 */
describe('the tenant a wizard subscription belongs to', () => {
  const TWO = [
    { id: 'default', name: 'Default' },
    { id: 'dept-a', name: 'Department A' },
  ]

  it('offers no choice when there is none to make', async () => {
    const res = await get('/setup/wizard/webhooks')
    expect(res.body).toContain('name="tenantId"')
    // A single-tenant deployment must see no tenant select.
    expect(res.body).not.toContain('<select class="select" name="tenantId"')
  })

  it('offers a picker once a second tenant exists', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/setup/wizard/webhooks')
    expect(res.body).toContain('<select class="select" name="tenantId"')
    expect(res.body).toContain('Department A')
  })

  it('creates the subscription in the tenant that was chosen', async () => {
    // The assertion that actually proves it: a select that posts nothing looks
    // identical to one that works.
    mockListTenants.mockResolvedValue(TWO)
    await post(
      '/setup/wizard/webhooks',
      { tenantId: 'dept-a', url: 'https://hooks.acme.example/x', eventMode: 'all' },
      '/setup/wizard/webhooks',
    )
    expect(mockCreateWebhookSub).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the picker, and the choice, when a field fails validation', async () => {
    // Every re-render path must receive the tenant list, or the select
    // silently degrades to a hidden field the moment anything is mistyped.
    mockListTenants.mockResolvedValue(TWO)
    const res = await post(
      '/setup/wizard/webhooks',
      { tenantId: 'dept-a', url: 'not-a-url', eventMode: 'all' },
      '/setup/wizard/webhooks',
    )
    expect(res.body).toContain('<select class="select" name="tenantId"')
    expect(res.body).toContain('value="dept-a" selected')
  })
})

/**
 * Finding a subscription when more than one tenant is in use.
 *
 * The tenant filter absorbed into the generic filter row as an ENUM select
 * (Task 7 of the admin table sort/filter plan, corrected in fix-round-1
 * Important 3/4): the deleted above-table form's `<select>` of tenant
 * id/name pairs is what this replaces, not a free-text box — a text box
 * accepts a substring, but `listWebhookSubs`'s upstream tenantId filter is an
 * EXACT match, so a fragment of the tenant NAME (rather than its id) used to
 * return zero rows before any client-side filtering ever ran. The tenant
 * list is no longer conditionally hidden below two tenants; the select is
 * always there, like every other column's filter control.
 */
describe('filtering the webhook list by tenant', () => {
  const TWO = [
    { id: 'default', name: 'Default' },
    { id: 'dept-a', name: 'Department A' },
  ]

  it('renders Tenant as a <select>, not a text box, matching the control it replaced', async () => {
    mockListTenants.mockResolvedValue(TWO)
    const res = await get('/webhooks')
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/<select[^>]*\bname="f_tenant"/)
    expect(res.body).not.toMatch(/<input[^>]*\bname="f_tenant"/)
    expect(res.body).toContain('Department A (dept-a)')
  })

  it('offers the same Tenant select regardless of how many tenants exist', async () => {
    const res = await get('/webhooks')
    expect(res.body).toMatch(/<select[^>]*\bname="f_tenant"/)
  })

  it('marks the chosen tenant selected and filters upstream by its exact id', async () => {
    mockListTenants.mockResolvedValue(TWO)
    // A row actually on that tenant, or the client-side Tenant filter drops
    // it to zero rows and hides the table body along with the select's
    // selected state having anything to prove.
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, tenantId: 'dept-a' }])
    const res = await get('/webhooks?tenantId=dept-a')
    expect(res.body).toMatch(/<option value="dept-a"[^>]* selected/)
    // Tenant scoping is still pushed upstream, same as before absorption —
    // and now, unlike a text box, guaranteed to be the exact id the store's
    // exact-match query needs.
    expect(mockListWebhookSubs).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the filter row after an action re-renders the list', async () => {
    // Five places render this view; every one must supply tableSpec/tableState,
    // or the filter row vanishes on re-render — the path that saves settings
    // and bounces back to the list is pinned here.
    mockListTenants.mockResolvedValue(TWO)
    const res = await post(
      // A label too: it is validated, and without one this renders the settings
      // page instead of the list — which would make the assertion below pass or
      // fail for the wrong reason.
      '/webhooks/whs_1/settings',
      { format: 'slack', headers: '', label: 'Billing service' },
      '/webhooks',
    )
    expect(res.statusCode).toBe(200)
    // Proves the list re-rendered, not the settings page with an error.
    expect(mockUpdateWebhookSub).toHaveBeenCalled()
    expect(res.body).toContain('name="f_tenant"')
  })

  it('still says which filter emptied the list', async () => {
    // Restored, fix-round-1 Critical 2: weakened last round to a bare
    // `toContain('empty-state')`, which the wrong empty state (the
    // unconditional "No webhooks configured" CTA, with no Clear control)
    // also satisfies. Against the pre-fix markup (table hidden entirely
    // whenever `subs.length === 0`) this fails — "No webhooks for tenant"
    // never appears, because that page had only the generic CTA message.
    mockListTenants.mockResolvedValue(TWO)
    mockListWebhookSubs.mockResolvedValue([])
    const res = await get('/webhooks?tenantId=dept-a')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('No webhooks for tenant')
  })
})
