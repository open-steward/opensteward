/**
 * Sending webhooks somewhere that dictates its own payload shape.
 *
 * A Slack incoming webhook answers `400 invalid_payload` to anything that is
 * not `{text}`/`{blocks}`, so the OpenSteward envelope could never reach a
 * Slack channel. A subscription picks a destination format, and can carry
 * custom headers for a receiver that authenticates by header.
 *
 * What these tests pin, all of which are easy to regress:
 *  - the form's values actually reach the API (a select that posts nothing
 *    looks identical to one that works);
 *  - a header value never appears in a response — it is a credential, and the
 *    whole point of storing it encrypted is defeated if the list page echoes it;
 *  - a malformed header line is reported to the operator rather than silently
 *    dropped, because a mangled credential fails later, at the receiver.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListWebhookSubs = vi.fn()
const mockCreateWebhookSub = vi.fn()
const mockUpdateWebhookSub = vi.fn()
const mockTestWebhookSub = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`, because vi.mock is hoisted above this file's imports — the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listWebhookSubs: mockListWebhookSubs,
      createWebhookSub: mockCreateWebhookSub,
      updateWebhookSub: mockUpdateWebhookSub,
      testWebhookSub: mockTestWebhookSub,
      // Everything else the routes touch — listTenants, getCompanyInfo,
      // getLoginOptions — answers with a read default. This file does not care
      // what they return, and does not break when a route starts calling one.
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'webhook-format-journey-session-secret-long-enough'

const SUB = {
  id: 'whs_1',
  tenantId: 'default',
  url: 'https://hooks.slack.com/services/T0/B0/xxx',
  events: ['*'],
  paused: false,
  createdAt: '2026-08-01T09:00:00.000Z',
  lastFiredAt: null,
  lastStatus: null,
  lastError: null,
  format: 'slack',
  headerNames: ['X-Api-Key'],
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListWebhookSubs.mockReset().mockResolvedValue([SUB])
  mockCreateWebhookSub.mockReset().mockResolvedValue({ ...SUB, secret: 'whsec_plaintext' })
  mockUpdateWebhookSub.mockReset().mockResolvedValue(SUB)
  mockTestWebhookSub
    .mockReset()
    .mockResolvedValue({ id: 'whs_1', ok: true, status: 200, format: 'slack' })
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

async function post(url: string, payload: Record<string, string>, role = 'admin') {
  const session = cookie(role)
  // The form pages mint the CSRF token, so read one from a real render.
  const page = await fastify.inject({ method: 'GET', url: '/webhooks', cookies: { session } })
  const token = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? ''
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session },
    payload: { _csrf: token, ...payload },
  })
}

describe('Journey: an operator points a webhook at a Slack channel', () => {
  it('offers the four destination formats on the create form', async () => {
    const res = await get('/webhooks/new')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="format"')
    for (const value of ['opensteward', 'slack', 'teams', 'flat']) {
      expect(res.body).toContain(`value="${value}"`)
    }
  })

  it('offers a custom-headers field and says Slack does not need one', async () => {
    const res = await get('/webhooks/new')
    expect(res.body).toContain('name="headers"')
    expect(res.body).toMatch(/their URL is the credential/i)
  })

  it('sends the chosen format and parsed headers to the API', async () => {
    const res = await post('/webhooks', {
      tenantId: 'default',
      url: 'https://hooks.slack.com/services/T0/B0/xxx',
      eventMode: 'all',
      format: 'slack',
      headers: 'X-Api-Key: k-123',
    })
    expect(res.statusCode).toBe(200)
    expect(mockCreateWebhookSub).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({
        format: 'slack',
        headers: { 'X-Api-Key': 'k-123' },
      }),
    )
  })

  it('omits headers entirely when the box is left empty', async () => {
    await post('/webhooks', {
      tenantId: 'default',
      url: 'https://example.test/hook',
      eventMode: 'all',
      format: 'opensteward',
      headers: '   ',
    })
    expect(mockCreateWebhookSub).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ headers: undefined }),
    )
  })

  it('reports a malformed header line instead of dropping it', async () => {
    const res = await post('/webhooks', {
      tenantId: 'default',
      url: 'https://example.test/hook',
      eventMode: 'all',
      format: 'opensteward',
      headers: 'X-Api-Key k-123',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/line 1/i)
    expect(mockCreateWebhookSub).not.toHaveBeenCalled()
  })

  it('refuses a header that would forge the delivery signature', async () => {
    const res = await post('/webhooks', {
      tenantId: 'default',
      url: 'https://example.test/hook',
      eventMode: 'all',
      format: 'opensteward',
      headers: 'x-oi-signature: sha256=forged',
    })
    expect(res.body).toMatch(/reserved/i)
    expect(mockCreateWebhookSub).not.toHaveBeenCalled()
  })

  it('rejects a format the renderer does not know', async () => {
    const res = await post('/webhooks', {
      tenantId: 'default',
      url: 'https://example.test/hook',
      eventMode: 'all',
      format: 'carrier-pigeon',
    })
    expect(res.body).toMatch(/payload format/i)
    expect(mockCreateWebhookSub).not.toHaveBeenCalled()
  })
})

describe('Journey: the list page shows how each subscription delivers', () => {
  it('shows the format and the header names', async () => {
    const res = await get('/webhooks')
    expect(res.body).toContain('Slack')
    expect(res.body).toContain('X-Api-Key')
  })

  it('never renders a header value', async () => {
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, headerNames: ['X-Api-Key'] }])
    const res = await get('/webhooks')
    expect(res.body).not.toContain('k-123')
    expect(res.body).toContain('••••')
  })

  it('lets an admin change the settings of an existing subscription', async () => {
    const res = await post('/webhooks/whs_1/settings', {
      format: 'teams',
      headers: 'Authorization: Bearer t',
      label: 'Billing service',
    })
    expect(res.statusCode).toBe(200)
    expect(mockUpdateWebhookSub).toHaveBeenCalledWith('jwt', 'whs_1', {
      format: 'teams',
      headers: { Authorization: 'Bearer t' },
      label: 'Billing service',
    })
  })

  it('clears every header when the box is emptied', async () => {
    // Wholesale replacement is the only way to remove a header, since values
    // are never shown back and so cannot be edited in place. The label follows
    // the same rule and for the same reason — the form always posts the field,
    // so an empty one is the operator clearing it.
    await post('/webhooks/whs_1/settings', { format: 'slack', headers: '' })
    expect(mockUpdateWebhookSub).toHaveBeenCalledWith('jwt', 'whs_1', {
      format: 'slack',
      headers: {},
      label: null,
    })
  })

  it('surfaces the upstream reason when saving fails', async () => {
    mockUpdateWebhookSub.mockRejectedValue(new Error('"te" is reserved and not allowed'))
    const res = await post('/webhooks/whs_1/settings', { format: 'slack', headers: 'X-Ok: 1' })
    expect(res.body).toContain('reserved')
  })

  // The page itself is operator-and-up (a viewer gets 403 on /webhooks
  // entirely); changing delivery settings is admin-only, like every other
  // mutation on this page.
  it('does not offer the settings form to an operator', async () => {
    const res = await get('/webhooks', 'operator')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('/settings')
  })

  it('refuses an operator who posts the settings form anyway', async () => {
    const res = await post('/webhooks/whs_1/settings', { format: 'slack' }, 'operator')
    expect(res.statusCode).toBe(403)
    expect(mockUpdateWebhookSub).not.toHaveBeenCalled()
  })
})

describe('Journey: proving a destination works without creating real data', () => {
  it('offers a Send test button to an admin', async () => {
    const res = await get('/webhooks')
    expect(res.body).toContain('/webhooks/whs_1/test')
    expect(res.body).toMatch(/send test/i)
  })

  it('reports success with the status the receiver returned', async () => {
    const res = await post('/webhooks/whs_1/test', {})
    expect(res.statusCode).toBe(200)
    expect(mockTestWebhookSub).toHaveBeenCalledWith('jwt', 'whs_1')
    expect(res.body).toMatch(/HTTP 200/)
  })

  it('reports a rejection as a failure the operator can act on', async () => {
    mockTestWebhookSub.mockResolvedValue({
      id: 'whs_1',
      ok: false,
      status: 400,
      format: 'opensteward',
    })
    const res = await post('/webhooks/whs_1/test', {})
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/HTTP 400/)
    expect(res.body).toMatch(/rejected/i)
  })

  it('reports an unreachable destination', async () => {
    mockTestWebhookSub.mockResolvedValue({
      id: 'whs_1',
      ok: false,
      status: null,
      error: 'getaddrinfo ENOTFOUND hooks.example',
      format: 'slack',
    })
    const res = await post('/webhooks/whs_1/test', {})
    expect(res.body).toContain('ENOTFOUND')
  })

  it('does not offer the button to an operator, and refuses their POST', async () => {
    const page = await get('/webhooks', 'operator')
    expect(page.body).not.toContain('/test')
    const res = await post('/webhooks/whs_1/test', {}, 'operator')
    expect(res.statusCode).toBe(403)
    expect(mockTestWebhookSub).not.toHaveBeenCalled()
  })
})

/**
 * The delivery-settings editor is a page opened as a modal from the row —
 * somewhere an operator can link to and read without the table squashing it,
 * with wholesale-replacement POST semantics behind the admin gate.
 */
describe('Journey: delivery settings are their own page', () => {
  it('serves the settings for one subscription at its own URL', async () => {
    const res = await get('/webhooks/whs_1/settings')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('action="/webhooks/whs_1/settings"')
    expect(res.body).toContain('name="format"')
    expect(res.body).toContain('name="headers"')
    expect(res.body).toContain('name="_csrf"')
  })

  it('preselects the format the subscription already uses', async () => {
    // A form that silently defaults back to the envelope would rewrite the
    // destination's format on any save that only touched the headers.
    const res = await get('/webhooks/whs_1/settings')
    expect(res.body).toMatch(/value="slack"\s+selected/)
  })

  it('says which endpoint is being changed and which headers it already has', async () => {
    const res = await get('/webhooks/whs_1/settings')
    expect(res.body).toContain('https://hooks.slack.com/services/T0/B0/xxx')
    expect(res.body).toContain('X-Api-Key')
    expect(res.body).toContain('••••')
  })

  it('keeps the explanation of why the header box is blank', async () => {
    // The only thing telling an operator that an empty box is not "no change".
    const res = await get('/webhooks/whs_1/settings')
    expect(res.body).toMatch(/never shown again/i)
    expect(res.body).toMatch(/replaces every custom header/i)
    expect(res.body).toMatch(/remove them all/i)
  })

  it('links the row at the page and marks it to open as a modal', async () => {
    const res = await get('/webhooks')
    expect(res.body).toContain('href="/webhooks/whs_1/settings"')
    expect(res.body).toContain('data-modal')
  })

  it('does not render an inline editor inside the table row', async () => {
    // Was `not.toContain('<details')` — too blunt once the row-actions cell
    // legitimately gained its own unrelated `<details>` disclosure (folding
    // pause/rotate/delete/test behind one "Actions" control, see
    // webhook-row-actions.test.ts). The actual invariant this test exists
    // for is narrower: the settings FORM itself (its `format` select and
    // `headers` textarea — asserted on directly above, against
    // /webhooks/:id/settings) must not be inlined into the list page. Fails
    // if a future edit copies that form's fields back into this row instead
    // of linking out to the settings page.
    const res = await get('/webhooks')
    expect(res.body).not.toContain('name="format"')
    expect(res.body).not.toContain('name="headers"')
  })

  it('refuses an operator the page, not just the POST', async () => {
    const res = await get('/webhooks/whs_1/settings', 'operator')
    expect(res.statusCode).toBe(403)
  })

  it('answers 404 for a subscription that is no longer there', async () => {
    // A rendered page rather than the framework's JSON 404, so a stale row
    // followed from the list lands somewhere with a way back.
    mockListWebhookSubs.mockResolvedValue([])
    const res = await get('/webhooks/whs_1/settings')
    expect(res.statusCode).toBe(404)
    expect(res.body).toMatch(/subscription not found/i)
    expect(res.body).toContain('href="/webhooks"')
  })
})

describe('Journey: a validation error keeps you on the settings page', () => {
  it('re-renders the settings form, not the list, when a header line is malformed', async () => {
    // The form lives at /webhooks/:id/settings. Bouncing a validation
    // failure to the list page throws away what the operator typed and leaves
    // them looking at a different page than the one they were editing.
    const res = await post('/webhooks/whs_1/settings', {
      format: 'slack',
      headers: 'X-Api-Key k-123',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatch(/line 1/i)
    // The settings form is present...
    expect(res.body).toContain('action="/webhooks/whs_1/settings"')
    // ...and what they typed survived, so they can correct it in place.
    expect(res.body).toContain('X-Api-Key k-123')
    expect(mockUpdateWebhookSub).not.toHaveBeenCalled()
  })

  it('keeps the chosen format selected after a validation error', async () => {
    const res = await post('/webhooks/whs_1/settings', {
      format: 'teams',
      headers: 'x-oi-signature: forged',
    })
    expect(res.body).toMatch(/reserved/i)
    expect(res.body).toMatch(/value="teams"[^>]*selected|selected[^>]*value="teams"/)
  })

  it('still reports an upstream failure on the settings page', async () => {
    mockUpdateWebhookSub.mockRejectedValue(new Error('upstream exploded'))
    const res = await post('/webhooks/whs_1/settings', { format: 'slack', headers: '' })
    expect(res.body).toContain('upstream exploded')
    expect(res.body).toContain('action="/webhooks/whs_1/settings"')
  })
})

/**
 * The list page reads `paused` from the API, and everything it shows about
 * pause state depends on that one field arriving.
 *
 * Lose it and the failure is silent in the worst direction: a paused
 * subscription renders exactly like a live one, and the toggle — whose label
 * and posted value both derive from it — can only ever pause. Deliveries stop,
 * the page looks normal, and the control that would restore them does the
 * opposite. Nothing here is hypothetical arithmetic; it is what the template
 * does with `undefined`.
 */
describe('a paused subscription says so, and can be resumed', () => {
  it('shows the badge and offers Resume', async () => {
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, paused: true }])
    const body = (await get('/webhooks')).body
    expect(body).toContain('Paused')
    expect(body).toContain('>Resume</button>')
    // The posted value is what actually resumes it — a Resume button that
    // posts `true` is a Pause button with the wrong label.
    expect(body).toContain('name="paused" value="false"')
  })

  it('offers Pause, and no badge, for a live one', async () => {
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, paused: false }])
    const body = (await get('/webhooks')).body
    expect(body).toContain('>Pause</button>')
    expect(body).toContain('name="paused" value="true"')
    expect(body).not.toContain('badge--danger">Paused')
  })

  it('treats a row with no paused field as live', async () => {
    // Rows from an older API omit it entirely; that must read as running
    // rather than render an empty badge.
    const { paused: _omitted, ...withoutPaused } = SUB
    mockListWebhookSubs.mockResolvedValue([withoutPaused])
    const body = (await get('/webhooks')).body
    expect(body).toContain('>Pause</button>')
    expect(body).not.toContain('badge--danger">Paused')
  })
})
