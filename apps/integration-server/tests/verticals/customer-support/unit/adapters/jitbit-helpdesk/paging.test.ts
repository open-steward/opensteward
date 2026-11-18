/**
 * Jitbit Helpdesk list paging.
 *
 * https://www.jitbit.com/docs/api/ documents:
 *
 *   - GET /api/Tickets: `count` "How many tickets to return. Default: 10. Max: 300."
 *     and `offset` "Use this to create paging. For example "offset=20&count=20"
 *     will return the next 20 tickets after the first 20. Default: 0."
 *   - GET /api/Users: `count` "number of users to return. Default: 500" and
 *     `page` "used to get the next set of users after the first one. So
 *     ?count=50 returns the first 50 users and ?count=50&page=2 returns the
 *     following 50 users." (no `offset`)
 *   - GET /api/comments?id=, /api/categories and /api/CommentTemplates take
 *     no paging parameter at all: they return the whole collection.
 *
 * The fakes below honour ONLY those parameters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { JitbitHelpdeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/index'

const creds: Credentials = {
  accessToken: 'tok',
  extra: { baseUrl: 'https://acme.jitbit.com/helpdesk/api', authScheme: 'Bearer' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: handler(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

/** GET /Tickets honouring only `count` (default 10, max 300) and `offset` (default 0). */
function tickets(n: number, prefix = 0) {
  return (_path: string, params: Record<string, unknown>) => {
    const asked = params['count'] === undefined ? 10 : Number(params['count'])
    const count = Math.min(asked, 300)
    const offset = Number(params['offset'] ?? 0)
    return Array.from({ length: n }, (_, i) => i + 1)
      .slice(offset, offset + count)
      .map((id) => ({ IssueID: prefix + id, Subject: `t${id}` }))
  }
}

/**
 * GET /Users honouring only `count` (default 500) and `page` (1-based).
 * `techEvery`: every k-th user is a technician, the rest are regular users.
 */
function users(n: number, techEvery: number) {
  return (_path: string, params: Record<string, unknown>) => {
    const count = params['count'] === undefined ? 500 : Number(params['count'])
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    return Array.from({ length: n }, (_, i) => i + 1)
      .slice((page - 1) * count, page * count)
      .map((id) => ({
        UserID: id,
        Username: `u${id}`,
        IsTech: id % techEvery === 0,
        IsAdmin: false,
      }))
  }
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number, pages = 3) {
  const ids: string[] = []
  const hasMore: (boolean | null)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'jitbit-helpdesk').meta.hasMore)
  }
  return { ids, hasMore }
}

describe('jitbit-helpdesk listTickets paging', () => {
  const adapter = new JitbitHelpdeskAdapter({})
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every ticket once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every ticket once when caller pages span upstream pages of 300', async () => {
    const L = 250
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests the documented offset with count=300 and mode=all', async () => {
    handler = tickets(701)
    await run(withPageSink({ page: 2, limit: 250 }))
    expect(calls.every((c) => c.path === '/Tickets')).toBe(true)
    expect(calls.every((c) => c.params['count'] === 300 && c.params['mode'] === 'all')).toBe(true)
    expect(calls.map((c) => c.params['offset'])).toEqual([0, 300])
  })

  it('an exact multiple of 300 ends on the empty page after it', async () => {
    handler = tickets(600)
    const { ids, hasMore } = await walk(run, 300)
    expect(ids).toEqual(range(600))
    expect(hasMore).toEqual([true, false, false])
  })

  it('a limit above the maximum is clamped to 300', async () => {
    handler = tickets(700)
    const adapterParams = parseListQuery({ limit: '9999' }, adapter)
    expect(adapterParams.limit).toBe(300)
    const rows = await run(adapterParams)
    expect(rows.map((r) => r.id)).toEqual(range(300))
    expect(listPage(rows, adapterParams, 'jitbit-helpdesk').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = tickets(41)
    const params = parseListQuery({ page: '2', limit: '20' }, adapter)
    const env = listPage(await run(params), params, 'jitbit-helpdesk')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it("keeps one connection's rows away from another token on the same helpdesk", async () => {
    const other: Credentials = { ...creds, accessToken: 'other' }
    handler = tickets(50, 0)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    handler = tickets(50, 1000)
    calls = []
    const rows = await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
    expect(rows.map((r) => r.id)).toEqual(
      range(40)
        .slice(20)
        .map((id) => String(1000 + Number(id))),
    )
    expect(calls.length).toBeGreaterThan(0)
  })

  it('a legacy cursor is sent as the upstream offset in one request', async () => {
    handler = tickets(300)
    const rows = await run({ cursor: '60', limit: 50 } as QueryParams)
    expect(calls).toEqual([{ path: '/Tickets', params: { count: 50, offset: 60, mode: 'all' } }])
    expect(rows.map((r) => r.id)).toEqual(range(110).slice(60))
  })

  it('a legacy cursor clamps a count above the maximum to 300', async () => {
    handler = tickets(1000)
    await run({ cursor: '0', limit: 9999 } as QueryParams)
    expect(calls).toEqual([{ path: '/Tickets', params: { count: 300, offset: 0, mode: 'all' } }])
  })
})

describe('jitbit-helpdesk listContacts / listUsers paging', () => {
  const adapter = new JitbitHelpdeskAdapter({})
  const contacts = (p: QueryParams) => adapter.listContacts(creds, p)
  const techs = (p: QueryParams) => adapter.listUsers(creds, p)

  it('serves every contact once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    // Every 4th user is a tech: 28 users hold 21 regular users.
    handler = users(28, 4)
    const { ids, hasMore } = await walk(contacts, L)
    expect(ids).toEqual(range(28).filter((id) => Number(id) % 4 !== 0))
    expect(ids).toHaveLength(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every technician once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = users(2 * L + 1, 1)
    const { ids, hasMore } = await walk(techs, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks upstream pages by the documented `page` parameter, not an offset', async () => {
    // 1,100 users, one tech in every 100: 11 techs spread over three upstream pages.
    handler = users(1100, 100)
    const { ids, hasMore } = await walk(techs, 5)
    expect(ids).toEqual([
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '1000',
      '1100',
    ])
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => c.path === '/Users' && c.params['count'] === 500)).toBe(true)
    expect(calls.some((c) => 'offset' in c.params)).toBe(false)
    expect(calls.map((c) => c.params['page'])).toEqual([1, 2, 3])
  })

  it('a limit above the maximum is clamped to 300', async () => {
    handler = users(800, 1000)
    const params = parseListQuery({ limit: '9999' }, adapter)
    expect(params.limit).toBe(300)
    const rows = await contacts(params)
    expect(rows).toHaveLength(300)
    expect(listPage(rows, params, 'jitbit-helpdesk').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = users(41, 1000)
    const params = parseListQuery({ page: '2', limit: '20' }, adapter)
    const env = listPage(await contacts(params), params, 'jitbit-helpdesk')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it("keeps one connection's users away from another token on the same helpdesk", async () => {
    const other: Credentials = { ...creds, accessToken: 'other' }
    handler = users(50, 1000)
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 20 }))
    // The other token sees a different directory: ids offset by 1000.
    handler = (path, params) =>
      (users(50, 1000)(path, params) as { UserID: number }[]).map((u) => ({
        ...u,
        UserID: u.UserID + 1000,
      }))
    calls = []
    const rows = await adapter.listContacts(other, withPageSink({ page: 2, limit: 20 }))
    expect(rows.map((r) => r.id)).toEqual(
      range(40)
        .slice(20)
        .map((id) => String(1000 + Number(id))),
    )
    expect(calls.length).toBeGreaterThan(0)
  })

  it('contacts and technicians walk separately on one connection', async () => {
    // Every 2nd user is a tech: odd ids are contacts, even ids are techs.
    handler = users(80, 2)
    const techPage1 = await techs(withPageSink({ page: 1, limit: 10 }))
    expect(techPage1.map((r) => r.id)).toEqual(range(20).filter((id) => Number(id) % 2 === 0))
    // No reset in between: contacts page 2 must not reuse the technician walk.
    const contactPage2 = await contacts(withPageSink({ page: 2, limit: 10 }))
    expect(contactPage2.map((r) => r.id)).toEqual(
      range(40)
        .filter((id) => Number(id) % 2 === 1)
        .slice(10),
    )
  })
})

describe('jitbit-helpdesk whole-collection lists are paged locally', () => {
  const adapter = new JitbitHelpdeskAdapter({})
  const L = 10
  const N = 2 * L + 1

  const cases: [
    string,
    string,
    (p: QueryParams) => Promise<{ id: string }[]>,
    (id: number) => object,
  ][] = [
    [
      'listMessages',
      '/comments',
      (p) => adapter.listMessages(creds, '7', p),
      (id) => ({ CommentID: id }),
    ],
    [
      'listTeams',
      '/categories',
      (p) => adapter.listTeams(creds, p),
      (id) => ({ CategoryID: id, Name: `c${id}` }),
    ],
    [
      'listMacros',
      '/CommentTemplates',
      (p) => adapter.listMacros(creds, p),
      (id) => ({ TemplateId: id, Name: `m${id}` }),
    ],
  ]

  for (const [name, path, run, row] of cases) {
    it(`${name} serves every row once, in order, across pages of 2L+1 rows`, async () => {
      handler = () => Array.from({ length: N }, (_, i) => row(i + 1))
      const { ids, hasMore } = await walk(run, L)
      expect(ids).toEqual(range(N))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.every((c) => c.path === path)).toBe(true)
    })

    it(`${name} API path: page 2 through parseListQuery and listPage`, async () => {
      handler = () => Array.from({ length: N }, (_, i) => row(i + 1))
      const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
      const env = listPage(await run(params), params, 'jitbit-helpdesk')
      expect(env.data.map((r) => r.id)).toEqual(range(2 * L).slice(L))
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })

    it(`${name} clamps a limit above the maximum to 300`, async () => {
      handler = () => Array.from({ length: 450 }, (_, i) => row(i + 1))
      const params = parseListQuery({ limit: '9999' }, adapter)
      const rows = await run(params)
      expect(rows).toHaveLength(300)
      expect(listPage(rows, params, 'jitbit-helpdesk').meta.hasMore).toBe(true)
    })
  }
})
