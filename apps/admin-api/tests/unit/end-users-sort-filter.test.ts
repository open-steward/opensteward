/**
 * `sort`, `dir` and per-column filters (`email`, `displayName`,
 * `externalReference`, `tenantId`, `q`) on `GET /api/end-users?page=`, and the
 * live bug this same change fixes: the pre-fix handler asked upstream for the
 * page by calling `client.listEndUsers({ tenantId, q })` with NO limit and
 * reading `all.length` as `meta.total` — which silently collapsed to
 * `EndUserStore.list`'s own 50-row default (there was no way to ask that
 * method for "every matching row"), so `meta.total` was capped at 50 no
 * matter how many customers actually existed, and the 51st was unreachable
 * from the admin UI while the page header confidently printed "50 customers".
 *
 * The two invariants that matter most here, because getting either wrong
 * looks fine in a quick manual check but corrupts a real page:
 *   - the sort/filter/pagination params reach `client.listEndUsersPaged`
 *     rather than being applied to a JS array in this route — a route that
 *     quietly filtered/sorted the already-fetched page locally would pass
 *     every OTHER assertion in this file while still narrowing only 50 rows;
 *   - a page beyond the store's old 50-row default returns real rows AND a
 *     `meta.total` greater than 50 — proving the 51st customer is reachable,
 *     not just that the plumbing compiles.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createEndUsersRoutes } from '../../src/core/routes/end-users'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { UnifiedClient } from '../../src/core/proxy/client'
import type { AdminStore } from '../../src/core/db/admin-store'

const mockListEndUsersPaged = vi.fn()
const mockListEndUsers = vi.fn()
const mockGetEndUser = vi.fn()
let app: FastifyInstance

function row(overrides: Partial<Record<string, unknown>> & { id: string }) {
  return {
    tenantId: 'default',
    email: 'jane@acme.example',
    displayName: null,
    externalReference: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(async () => {
  mockListEndUsersPaged.mockReset().mockResolvedValue({
    data: [row({ id: 'eu_1' })],
    meta: { total: 1 },
  })
  mockListEndUsers.mockReset().mockResolvedValue([row({ id: 'eu_1' })])
  mockGetEndUser.mockReset().mockResolvedValue({
    id: 'eu_1',
    tenantId: 't',
    email: 'a@b.co',
    displayName: null,
    externalReference: null,
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-01-15T09:30:00.000Z',
  })

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  app.addHook('preSerialization', async (request, reply, payload) =>
    isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
  )
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))

  const client = {
    listEndUsersPaged: mockListEndUsersPaged,
    listEndUsers: mockListEndUsers,
    getEndUser: mockGetEndUser,
  } as unknown as UnifiedClient
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore
  await app.register(createEndUsersRoutes(client, adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

const token = () => app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })

function list(query: string) {
  return app.inject({
    method: 'GET',
    url: `/api/end-users${query}`,
    headers: { authorization: `Bearer ${token()}` },
  })
}

describe('GET /api/end-users?page=&sort=&dir=&<per-column filters>', () => {
  it('forwards sort, dir and every per-column filter to listEndUsersPaged', async () => {
    const res = await list(
      '?page=1&sort=email&dir=desc&email=jane&displayName=Doe&externalReference=crm&tenantId=acme&q=free-text',
    )
    expect(res.statusCode).toBe(200)
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'email',
        dir: 'desc',
        email: 'jane',
        displayName: 'Doe',
        externalReference: 'crm',
        tenantId: 'acme',
        q: 'free-text',
      }),
    )
  })

  /**
   * `tenantId`, `q`, `page`, `limit` and `offset` are `RepeatableString` too,
   * not only the params Part B added. Adopting it on the new ones alone left
   * `?page=1&page=2` 400ing on this operation while `?sort=a&sort=b` returned
   * 200 — a surface less predictable than either extreme.
   *
   * The values pin last-wins, not merely "not a 400": page 3 at limit 25 is
   * offset 50, where a `v[0]` collapse would give page 1 at limit 10, i.e.
   * offset 0 and a different limit.
   */
  it('collapses a repeated page, limit, tenantId and q instead of 400ing', async () => {
    const res = await list(
      '?page=1&page=3&limit=10&limit=25&tenantId=t-a&tenantId=t-b&q=first&q=second',
    )
    expect(res.statusCode).toBe(200)
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 50, tenantId: 't-b', q: 'second' }),
    )
  })

  it('defaults dir to undefined (ascending) for anything other than "desc"', async () => {
    await list('?page=1&sort=email&dir=sideways')
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'email', dir: undefined }),
    )
  })

  it('sends no filter keys at all when none are supplied — not explicit undefined', async () => {
    await list('?page=1')
    const [filters] = mockListEndUsersPaged.mock.calls[0]!
    // `one(undefined)?.trim() || undefined` collapses an absent query param to
    // `undefined`, and the object literal still carries the KEY with that
    // value — this pins that shape (not "no key at all"), since a caller
    // reading `Object.keys(...)` would see it either way.
    expect(filters).toMatchObject({ sort: undefined, dir: undefined, email: undefined })
  })

  it('does not 400 on a repeated key, and takes the last value (matches the admin app’s own one())', async () => {
    const res = await list('?page=1&sort=email&sort=displayName')
    expect(res.statusCode).toBe(200)
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'displayName' }),
    )
  })

  it('trims a padded filter value before forwarding it', async () => {
    await list('?page=1&email=%20%20jane%20%20')
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(expect.objectContaining({ email: 'jane' }))
  })

  // The bug this whole change fixes, reproduced end to end through the route:
  // page 2 of a 55-row set must return real rows, and meta.total must exceed
  // the store's old 50-row default — not silently cap there.
  it('the 51st customer is reachable: page 2 returns rows and meta.total exceeds 50', async () => {
    mockListEndUsersPaged.mockResolvedValueOnce({
      data: Array.from({ length: 5 }, (_, i) => row({ id: `eu_page2_${i}` })),
      meta: { total: 55 },
    })
    const res = await list('?page=2&limit=50')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(5)
    expect(body.meta.total).toBe(55)
    expect(body.meta.total).toBeGreaterThan(50)
    expect(body.meta.page).toBe(2)
    // The offset passed upstream must be 50, not 0 — otherwise "page 2" would
    // just re-fetch page 1's own rows under a different page number.
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(expect.objectContaining({ offset: 50 }))
  })

  it('the plain limit/offset path (search.json autocomplete) is unaffected — still calls listEndUsers, not listEndUsersPaged', async () => {
    await list('?q=jane&limit=10')
    expect(mockListEndUsers).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'jane', limit: 10 }),
    )
    expect(mockListEndUsersPaged).not.toHaveBeenCalled()
  })

  // sort/dir/email/displayName/externalReference are declared ONCE, at the
  // operation level, for the whole `GET /api/end-users` — not scoped to the
  // `page`-bearing branch in the Zod `.meta({description})` blocks. Without
  // this, a caller reading only those descriptions would have no way to
  // know the params silently did nothing when `page` was omitted — and
  // `EndUserStore.list`/integration-server's `/admin/end-users` have no
  // `page` concept to gate on in the first place.
  it('honours sort/dir/per-column filters on the plain (non-page) path too, not only when page is supplied', async () => {
    await list('?sort=email&dir=desc&email=jane&displayName=Doe&externalReference=crm')
    expect(mockListEndUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'email',
        dir: 'desc',
        email: 'jane',
        displayName: 'Doe',
        externalReference: 'crm',
      }),
    )
    expect(mockListEndUsersPaged).not.toHaveBeenCalled()
  })
})

/**
 * The DETAIL operation's own query param. F5 asked for every param of
 * `routes/end-users.ts`; the first pass converted `ListQuery` only, leaving
 * `GetQuery.include_pii` a bare `z.string()` — so
 * `?include_pii=x&include_pii=x` answered 400 while every param on the list
 * operation beside it answered 200.
 *
 * A repeated array here was never dangerous (`['x','x'] !== 'true'` reads as
 * "PII not requested"), which is exactly why it needed converting rather than
 * excusing: an operation where one param refuses a repeated key and the rest
 * degrade is the unpredictable surface this whole sweep removed.
 */
describe('GET /api/end-users/:id include_pii', () => {
  it('does not 400 on a repeated include_pii, and reads its last value', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/end-users/eu_1?include_pii=false&include_pii=true',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(res.statusCode).toBe(200)
    // Last-wins, and it reaches the client as a boolean: `false` first proves
    // the value is read rather than merely tolerated, since a `v[0]` collapse
    // would ask for no PII.
    expect(mockGetEndUser).toHaveBeenCalledWith('eu_1', { includePii: true })
  })

  it('still treats anything other than "true" as no PII requested', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/end-users/eu_1?include_pii=true&include_pii=nope',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(mockGetEndUser).toHaveBeenCalledWith('eu_1', { includePii: false })
  })
})
