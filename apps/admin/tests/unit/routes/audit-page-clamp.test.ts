/**
 * Part A hardening for `GET /audit` (`apps/admin/src/core/routes/audit.ts:25`).
 *
 * This route's own page value was `parseInt(request.query.page ?? '1', 10)`,
 * unclamped, same as admin-api's `/api/audit` route was before its fix — and
 * it matters independently, for two reasons:
 *
 *   1. axios forwards it verbatim as `?page=NaN`/`?page=0`/`?page=-3` to
 *      admin-api, so a hand-edited URL here is how A4/A5 are actually
 *      reachable from a browser.
 *   2. The view used to be rendered with THIS route's own local `page`
 *      variable, so an unclamped value reached `_pagination.ejs` directly.
 *      Part D moved the clamp into `parseTableQuery` (which is array-safe as
 *      well as lower-bounded, unlike the `parseInt` block it replaced) and
 *      moved the rendered page onto admin-api's echoed `meta.page`, since
 *      admin-api is the one paginating. The FORWARDING assertion below is
 *      therefore the load-bearing one in each case: it is what fails if the
 *      clamp is removed. The "Page 1 of" assertions now pin that the page
 *      renders admin-api's answer rather than the raw request, which is a
 *      weaker but still real guard — a route that echoed `?page=-3` back into
 *      the view would fail them.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListAudit = vi.fn()

vi.mock('../../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listAudit: mockListAudit,
    }),
  }
})

const { buildServer } = await import('../../../src/core/server')

const SESSION_SECRET = 'audit-page-clamp-secret-long-enough'
let fastify: FastifyInstance

beforeEach(async () => {
  mockListAudit.mockReset()
  mockListAudit.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0 } })
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

const session = () =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }))

const get = (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: session() } })

describe('GET /audit page clamp', () => {
  // A4
  it('?page=abc is not forwarded as NaN and does not render NaN', async () => {
    const res = await get('/audit?page=abc')
    expect(res.statusCode).toBe(200)
    expect(mockListAudit).toHaveBeenCalledWith(expect.any(String), 1, 50, {}, undefined, undefined)
    expect(res.payload).not.toMatch(/NaN/)
  })

  // A5
  it.each(['0', '-3'])(
    '?page=%s forwards page=1 to admin-api and renders "Page 1 of"',
    async (raw) => {
      mockListAudit.mockResolvedValue({
        data: [{ id: 1 }],
        meta: { page: 1, limit: 1, total: 3 },
      })
      const res = await get(`/audit?page=${raw}`)
      expect(res.statusCode).toBe(200)
      expect(mockListAudit).toHaveBeenCalledWith(expect.any(String), 1, 50, {}, undefined, undefined)
      expect(res.payload).toContain('Page 1 of')
      expect(res.payload).not.toContain(`Page ${raw} of`)
    },
  )

  it('a well-formed page is forwarded untouched', async () => {
    const res = await get('/audit?page=3')
    expect(res.statusCode).toBe(200)
    expect(mockListAudit).toHaveBeenCalledWith(expect.any(String), 3, 50, {}, undefined, undefined)
  })
})
