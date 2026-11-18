/**
 * Issuing a Connect Link to a customer you already have open.
 *
 * Both customer surfaces lead here. The list carries an Actions column —
 * everything doable to that row — and a customer's own page offers it from the
 * Connect links card, where their existing links already are.
 *
 * Both hand the customer through as `?customer=<id>`, and the form arrives with
 * them chosen: email filled, the hidden `endUserId` set so no duplicate is
 * created, the match confirmed on screen, and Display name gone — it names a
 * customer being created, and this one already exists.
 *
 * Resolved server-side rather than left to the script, so the form is right
 * before anything runs and stays right without JavaScript at all. The datalist
 * is seeded with the same customer so the script's own resolution agrees with
 * what the server rendered instead of clearing it.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CUSTOMER = {
  id: 'eu_1',
  tenantId: 'default',
  email: 'jane@acme.example',
  displayName: 'Jane Doe (Acme)',
  externalReference: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
}

const getEndUser = vi.fn()
const listEndUsersPaged = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getEndUser,
      listEndUsersPaged,
      listAllPlatformRows: async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ],
      listCatalog: async () => [{ vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' }],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connect-link-from-customer-secret-long-enough'
let fastify: FastifyInstance

beforeEach(async () => {
  getEndUser.mockReset().mockResolvedValue(CUSTOMER)
  listEndUsersPaged
    .mockReset()
    .mockResolvedValue({ data: [CUSTOMER], meta: { page: 1, limit: 25, total: 1 } })
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

const session = (role = 'admin') =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))

const get = (url: string, role = 'admin') =>
  fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })

describe('getting to the form from a customer', () => {
  it('offers it on every row of the customers list', async () => {
    const res = await get('/customers')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/connect-links/new?customer=eu_1"')
    expect(res.body).toContain('Actions')
  })

  it('offers it from the customer page, beside their existing links', async () => {
    const res = await get('/customers/eu_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/connect-links/new?customer=eu_1"')
  })

  it('shows a viewer the row without the actions they cannot take', async () => {
    const res = await get('/customers', 'viewer')
    expect(res.statusCode).toBe(200)
    // Still able to open the customer — the column is not empty for them.
    expect(res.body).toContain('href="/customers/eu_1"')
    expect(res.body).not.toContain('/connect-links/new?customer=eu_1')
    expect(res.body).not.toContain('/customers/eu_1/delete')
  })
})

describe('the form arrives with the customer already chosen', () => {
  it('fills the email and captures the id, so no duplicate is created', async () => {
    const res = await get('/connect-links/new?customer=eu_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('value="jane@acme.example"')
    expect(res.body).toContain('name="endUserId" id="endUserId" value="eu_1"')
  })

  it('confirms who it is, and drops the Display name field', async () => {
    const res = await get('/connect-links/new?customer=eu_1')
    // Display name names a customer being created; this one exists already.
    expect(res.body).toMatch(/id="customerDisplayNameField"[^>]*style="display: none"/)
    expect(res.body).toContain('Jane Doe (Acme) (jane@acme.example)')
  })

  it('seeds the datalist so the script agrees with the server', async () => {
    // The script resolves the typed address against this list. Left empty, its
    // first run would find no match and clear the id the server just set.
    const res = await get('/connect-links/new?customer=eu_1')
    expect(res.body).toContain('data-id="eu_1"')
    expect(res.body).toContain('data-tenant="default"')
  })

  it('carries the state in the form markup, not in a script', async () => {
    // Everything above is rendered, not scripted. Asserted against the <form>
    // itself rather than "before the first <script>", since the layout loads
    // scripts in the head — the point is that the values are attributes, not
    // something a load handler fills in.
    const res = await get('/connect-links/new?customer=eu_1')
    const start = res.body.indexOf('<form method="POST" action="/connect-links"')
    expect(start).toBeGreaterThan(-1)
    // Search for the close FROM the open: the layout renders forms of its own
    // above the page content, so a bare indexOf finds one of those and slices
    // backwards into an empty string that passes nothing and proves nothing.
    const form = res.body.slice(start, res.body.indexOf('</form>', start))
    expect(form).toContain('value="jane@acme.example"')
    expect(form).toContain('value="eu_1"')
    expect(form).toContain('data-id="eu_1"')
  })
})

describe('when the customer cannot be resolved', () => {
  it('degrades to the blank form rather than failing', async () => {
    // A stale bookmark, a deleted customer, a mistyped id. The form is still
    // useful — it just asks who this is for.
    getEndUser.mockResolvedValue(null)
    const res = await get('/connect-links/new?customer=eu_gone')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="customerEmail"')
    expect(res.body).toContain('name="endUserId" id="endUserId" value=""')
  })

  it('does the same when the lookup itself fails', async () => {
    getEndUser.mockRejectedValue(new Error('admin-api unreachable'))
    const res = await get('/connect-links/new?customer=eu_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="customerEmail"')
  })

  it('leaves the form untouched when no customer is named', async () => {
    const res = await get('/connect-links/new')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="endUserId" id="endUserId" value=""')
    expect(getEndUser).not.toHaveBeenCalled()
  })
})

describe('the Delete action is safe and correctly gated', () => {
  it('keeps the customer address out of the confirm() string', () => {
    // EJS escapes for HTML, but a browser HTML-decodes an attribute before the
    // JS engine parses it — so an apostrophe arrives as a real quote and ends
    // the literal. An address containing one stops the handler being a function
    // at all, and Delete then fires on the first click with no dialog. Addresses
    // also reach us from the unauthenticated self-register endpoint, which
    // stores whatever passes a loose regex, so this is reachable by someone
    // other than the operator.
    const evil = String.raw`a'+alert(1)+'@x.yy`
    listEndUsersPaged.mockResolvedValue({
      data: [{ ...CUSTOMER, email: evil }],
      meta: { page: 1, limit: 25, total: 1 },
    })
    return get('/customers').then((res) => {
      const onsubmit = /onsubmit="([^"]*)"/.exec(res.body)?.[1] ?? ''
      expect(onsubmit).not.toContain('alert(')
      expect(onsubmit).not.toContain('x.yy')
      expect(onsubmit).toContain('Delete this customer?')
    })
  })

  it('offers Delete to an admin but not an operator', async () => {
    // admin-api's DELETE /api/end-users/:id is adminOnly, so offering it to an
    // operator is offering something that answers 403.
    expect((await get('/customers', 'admin')).body).toContain('/customers/eu_1/delete')
    expect((await get('/customers', 'operator')).body).not.toContain('/customers/eu_1/delete')
  })

  it('still lets an operator issue a connect link', async () => {
    // Narrowing Delete must not narrow the rest of the column.
    expect((await get('/customers', 'operator')).body).toContain('/connect-links/new?customer=eu_1')
  })
})
