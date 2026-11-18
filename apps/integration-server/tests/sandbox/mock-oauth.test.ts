/**
 * The sandbox mock OAuth ceremony over HTTP: connect → (authorize page) →
 * callback, with ?outcome= driving denied/error/expired programmatically, and
 * the hosted mock connect-link journey (picker → authorize → done). The only
 * connection id the ceremony can ever emit is the DERIVED sandbox id — the
 * same one GET /test/v1/connections lists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { sandboxConnectionId } from '@opensteward/shared'

const TENANT = 'default'

/** Extract the `state` query value from a redirect Location. */
function stateOf(location: string): string {
  const m = /[?&]state=([0-9a-f]+)/.exec(location)
  if (!m) throw new Error(`no state in Location: ${location}`)
  return m[1]!
}

describe('/test/v1 mock OAuth ceremony', () => {
  let server: TestServer
  let testKey: string

  beforeAll(async () => {
    server = await buildTestServer()
    const test = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'], mode: 'test' })
    testKey = test.plaintext
  })
  afterAll(async () => {
    await server?.cleanup()
  })

  const get = (url: string) => server.fastify.inject({ method: 'GET', url })

  it('validates params like the live route: missing tenant_id 400, wrong platform 404', async () => {
    const noTenant = await get('/test/v1/auth/accounting/sandbox/connect')
    expect(noTenant.statusCode).toBe(400)
    expect(noTenant.json().error.code).toBe('MISSING_PARAMS')

    const wrongPlatform = await get('/test/v1/auth/accounting/fortnox/connect?tenant_id=default')
    expect(wrongPlatform.statusCode).toBe(404)
    expect(wrongPlatform.json().error.code).toBe('ADAPTER_UNAVAILABLE')

    const wrongVertical = await get('/test/v1/auth/nope/sandbox/connect?tenant_id=default')
    expect(wrongVertical.statusCode).toBe(404)

    const badOutcome = await get(
      '/test/v1/auth/accounting/sandbox/connect?tenant_id=default&outcome=maybe',
    )
    expect(badOutcome.statusCode).toBe(400)
    expect(badOutcome.json().error.code).toBe('INVALID_OUTCOME')
  })

  it('runs the interactive journey: connect → authorize page → Approve → 201 with the derived id', async () => {
    const connect = await get('/test/v1/auth/crm/sandbox/connect?tenant_id=default&label=demo')
    expect(connect.statusCode).toBe(302)
    const authorizeUrl = connect.headers.location as string
    expect(authorizeUrl).toContain('/test/v1/auth/sandbox/authorize?state=')

    const page = await get(authorizeUrl)
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    // Zero-JS page: CSP pins script-src 'none' and the body carries no
    // fetch( text (belt-and-braces for the egress guard's rule).
    expect(page.headers['content-security-policy']).toContain("script-src 'none'")
    expect(page.body).not.toContain('fetch(')
    expect(page.body).toContain('Approve')
    expect(page.body).toContain('Deny')

    const state = stateOf(authorizeUrl)
    const cb = await get(`/test/v1/auth/crm/sandbox/callback?code=sbx_approved&state=${state}`)
    expect(cb.statusCode).toBe(201)
    const data = cb.json().data
    expect(data.id).toBe(sandboxConnectionId(TENANT, 'crm'))
    expect(data.platform).toBe('sandbox')
    expect(data.label).toBe('demo')
    expect(data.status).toBe('connected')

    // The granted id is real: it resolves on the authenticated control plane.
    const conn = await server.fastify.inject({
      method: 'GET',
      url: `/test/v1/connections/${data.id}`,
      headers: { authorization: `Bearer ${testKey}` },
    })
    expect(conn.statusCode).toBe(200)
  })

  it('outcome=granted skips the page and lands on 201 directly', async () => {
    const connect = await get(
      '/test/v1/auth/payments/sandbox/connect?tenant_id=default&outcome=granted',
    )
    expect(connect.statusCode).toBe(302)
    const loc = connect.headers.location as string
    expect(loc).toContain('/test/v1/auth/payments/sandbox/callback?code=')
    const cb = await get(loc)
    expect(cb.statusCode).toBe(201)
    expect(cb.json().data.id).toBe(sandboxConnectionId(TENANT, 'payments'))
  })

  it('denied / error / expired outcomes return the matching 400s and never an id', async () => {
    const denied = await get(
      '/test/v1/auth/accounting/sandbox/connect?tenant_id=default&outcome=denied',
    )
    const deniedCb = await get(denied.headers.location as string)
    expect(deniedCb.statusCode).toBe(400)
    expect(deniedCb.json().error.code).toBe('OAUTH_ACCESS_DENIED')
    expect(JSON.stringify(deniedCb.json())).not.toContain(sandboxConnectionId(TENANT, 'accounting'))

    const errored = await get(
      '/test/v1/auth/accounting/sandbox/connect?tenant_id=default&outcome=error',
    )
    const erroredCb = await get(errored.headers.location as string)
    expect(erroredCb.statusCode).toBe(400)
    expect(erroredCb.json().error.code).toBe('OAUTH_PROVIDER_ERROR')

    const expired = await get(
      '/test/v1/auth/accounting/sandbox/connect?tenant_id=default&outcome=expired',
    )
    const expiredCb = await get(expired.headers.location as string)
    expect(expiredCb.statusCode).toBe(400)
    expect(expiredCb.json().error.code).toBe('INVALID_STATE')
  })

  it('enforces one-time state: replay → INVALID_STATE, swapped vertical → STATE_MISMATCH', async () => {
    const first = await get(
      '/test/v1/auth/ecommerce/sandbox/connect?tenant_id=default&outcome=granted',
    )
    const loc = first.headers.location as string
    expect((await get(loc)).statusCode).toBe(201)
    // Same state again — consumed.
    const replay = await get(loc)
    expect(replay.statusCode).toBe(400)
    expect(replay.json().error.code).toBe('INVALID_STATE')

    const second = await get(
      '/test/v1/auth/logistics/sandbox/connect?tenant_id=default&outcome=granted',
    )
    const state = stateOf(second.headers.location as string)
    const swapped = await get(`/test/v1/auth/projects/sandbox/callback?code=x&state=${state}`)
    expect(swapped.statusCode).toBe(400)
    expect(swapped.json().error.code).toBe('STATE_MISMATCH')
  })

  it('runs the hosted connect-link journey end-to-end: mint → picker → authorize → done', async () => {
    const customers = await server.fastify.inject({
      method: 'GET',
      url: '/test/v1/customers',
      headers: { authorization: `Bearer ${testKey}` },
    })
    const cid = customers.json().data[0].id as string
    const mint = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/customers/${cid}/connect-links`,
      headers: { authorization: `Bearer ${testKey}`, 'content-type': 'application/json' },
      payload: {},
    })
    const token = mint.json().data.token as string

    const picker = await get(`/test/v1/connect/${token}`)
    expect(picker.statusCode).toBe(200)
    expect(picker.body).toContain('Connect accounting sandbox')

    // Follow the picker's accounting link (link token rides along).
    const connect = await get(
      `/test/v1/auth/accounting/sandbox/connect?tenant_id=${TENANT}&link=${token}`,
    )
    const authorizeUrl = connect.headers.location as string
    const state = stateOf(authorizeUrl)
    const cb = await get(`/test/v1/auth/accounting/sandbox/callback?code=sbx_ok&state=${state}`)
    // Link flow redirects to the hosted done page instead of returning JSON.
    expect(cb.statusCode).toBe(302)
    const doneUrl = cb.headers.location as string
    expect(doneUrl).toContain(`/test/v1/connect/${token}/done`)

    const done = await get(doneUrl)
    expect(done.statusCode).toBe(200)
    expect(done.body).toContain(sandboxConnectionId(TENANT, 'accounting'))

    // A tampered token 404s on every hosted page.
    const tampered = await get(`/test/v1/connect/${token.slice(0, -2)}xx`)
    expect(tampered.statusCode).toBe(404)
  })

  it('denied from a link flow renders the HTML error page, not JSON', async () => {
    const customers = await server.fastify.inject({
      method: 'GET',
      url: '/test/v1/customers',
      headers: { authorization: `Bearer ${testKey}` },
    })
    const cid = customers.json().data[0].id as string
    const mint = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/customers/${cid}/connect-links`,
      headers: { authorization: `Bearer ${testKey}`, 'content-type': 'application/json' },
      payload: {},
    })
    const token = mint.json().data.token as string
    const connect = await get(
      `/test/v1/auth/docsign/sandbox/connect?tenant_id=${TENANT}&link=${token}&outcome=denied`,
    )
    const cb = await get(connect.headers.location as string)
    expect(cb.statusCode).toBe(400)
    expect(cb.headers['content-type']).toContain('text/html')
    expect(cb.body).toContain('Access denied')
  })
})
