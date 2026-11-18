/**
 * Unthread list paging: 1-based `page` + caller's `limit` → Unthread's list
 * body `{ limit, cursor }`, carrying `cursors.next` forward.
 *
 * From https://docs.unthread.io/docs/api-docs/api-reference (API Conventions →
 * List Endpoints):
 *
 *   "All list endpoints follow the same conventions."
 *   interface ListRequest { ... limit?: number; descending?: boolean; cursor?: string; }
 *   interface ListResponse { data: Array<ObjectType>; totalCount: number;
 *     cursors: { hasNext: boolean; hasPrevious: boolean; next?: string; previous?: string; }; }
 *   "Responses are paginated by providing a cursor to the next or previous page.
 *    The limit per page is 100."
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { UnthreadAdapter } from '../../../../../../src/verticals/customer-support/adapters/unthread/index'

const CREDS = { accessToken: 'ut_test' }
/** Documented: "The limit per page is 100." */
const MAX = 100

type Call = { path: string; body: Record<string, unknown> }

const PATHS = {
  tickets: '/conversations/list',
  messages: '/conversations/c1/messages/list',
  contacts: '/customers/list',
  users: '/users/list',
  tags: '/tags/list',
  teams: '/user-groups/list',
} as const
type Resource = keyof typeof PATHS

/**
 * A fake Unthread honouring ONLY the documented list body: `limit` (at most
 * 100) and `cursor` (opaque, from the previous response's `cursors.next`).
 * `cursors.hasNext` / `cursors.next` are present exactly when rows remain.
 */
function fakeUnthread(
  sizes: Partial<Record<Resource, number>>,
  opts: { nextOnLastPage?: boolean } = {},
) {
  const calls: Call[] = []
  const encode = (offset: number) => Buffer.from(`o:${offset}`).toString('base64')
  const decode = (c: unknown) => Number(Buffer.from(String(c), 'base64').toString('utf8').slice(2))

  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    calls.push({ path, body })
    const resource = (Object.keys(PATHS) as Resource[]).find((r) => PATHS[r] === path)
    if (!resource) throw new Error(`unexpected POST ${path}`)
    for (const k of Object.keys(body)) {
      if (k !== 'limit' && k !== 'cursor') throw new Error(`undocumented body key ${k}`)
    }
    const limit = body['limit'] ?? MAX
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX) {
      throw Object.assign(new Error(`limit must be 1..${MAX} (got ${String(limit)})`), {
        response: { status: 400 },
      })
    }
    const all = Array.from({ length: sizes[resource] ?? 0 }, (_, i) => ({
      id: `${resource}-${i + 1}`,
    }))
    const start = body['cursor'] === undefined ? 0 : decode(body['cursor'])
    const data = all.slice(start, start + limit)
    const end = start + data.length
    const hasNext = end < all.length
    return {
      data: {
        data,
        totalCount: all.length,
        cursors: {
          hasNext,
          hasPrevious: start > 0,
          ...(hasNext || opts.nextOnLastPage ? { next: encode(end) } : {}),
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post } as never)
  return calls
}

type ListFn = (a: UnthreadAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

const LISTS: Array<[string, Resource, ListFn]> = [
  ['listTickets', 'tickets', (a, p) => a.listTickets(CREDS, p)],
  ['listMessages', 'messages', (a, p) => a.listMessages(CREDS, 'c1', p)],
  ['listContacts', 'contacts', (a, p) => a.listContacts(CREDS, p)],
  ['listUsers', 'users', (a, p) => a.listUsers(CREDS, p)],
  ['listTags', 'tags', (a, p) => a.listTags(CREDS, p)],
  ['listTeams', 'teams', (a, p) => a.listTeams(CREDS, p)],
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Unthread lists serve every row once, page by page', () => {
  for (const [name, resource, list] of LISTS) {
    it(`${name}: 2L+1 rows over pages 1..3 at limit L, with hasMore exact`, async () => {
      const L = 4
      fakeUnthread({ [resource]: 2 * L + 1 })
      const adapter = new UnthreadAdapter()
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(adapter, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${resource}-${i + 1}`))
      expect(more).toEqual([true, true, false])
    })

    it(`${name}: page 2 sends cursors.next from page 1 at the caller size`, async () => {
      const calls = fakeUnthread({ [resource]: 9 })
      const adapter = new UnthreadAdapter()
      await list(adapter, withPageSink({ page: 1, limit: 4 }))
      await list(adapter, withPageSink({ page: 2, limit: 4 }))
      expect(calls).toHaveLength(2)
      expect(calls[0]!.body).toEqual({ limit: 4 })
      expect(calls[1]!.body).toEqual({ limit: 4, cursor: Buffer.from('o:4').toString('base64') })
    })

    it(`${name}: a limit above the documented 100 is clamped`, async () => {
      const calls = fakeUnthread({ [resource]: 150 })
      const rows = await list(new UnthreadAdapter(), withPageSink({ page: 1, limit: 500 }))
      expect(calls.map((c) => c.body['limit'])).toEqual([MAX])
      expect(rows).toHaveLength(MAX)
    })
  }

  it('a cold page 3 walks the cursor chain rather than repeating page 1', async () => {
    fakeUnthread({ tickets: 9 })
    const rows = await new UnthreadAdapter().listTickets(CREDS, withPageSink({ page: 3, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['tickets-9'])
  })

  it('messages of different conversations do not share a cursor chain', async () => {
    const calls = fakeUnthread({ messages: 9 })
    const adapter = new UnthreadAdapter()
    await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 1, limit: 4 }))
    await expect(
      adapter.listMessages(CREDS, 'c2', withPageSink({ page: 2, limit: 4 })),
    ).rejects.toThrow(/unexpected POST \/conversations\/c2/)
    expect(calls.map((c) => c.path)).toEqual([PATHS.messages, '/conversations/c2/messages/list'])
    expect(calls[1]!.body).toEqual({ limit: 4 })
  })

  it('cursors are scoped per connection: another token walks its own chain', async () => {
    const calls = fakeUnthread({ tickets: 9 })
    const adapter = new UnthreadAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listTickets({ accessToken: 'ut_other' }, withPageSink({ page: 2, limit: 4 }))
    expect(calls.slice(1).map((c) => c.body)).toEqual([
      { limit: 4 },
      { limit: 4, cursor: Buffer.from('o:4').toString('base64') },
    ])
  })

  it('a page-2 request at a different limit does not reuse a cursor minted at another limit', async () => {
    const calls = fakeUnthread({ tickets: 9 })
    const adapter = new UnthreadAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['tickets-4', 'tickets-5', 'tickets-6'])
    expect(calls.slice(1).map((c) => c.body)).toEqual([
      { limit: 3 },
      { limit: 3, cursor: Buffer.from('o:3').toString('base64') },
    ])
  })

  it('cursors.hasNext false is the end even when a next cursor is present', async () => {
    fakeUnthread({ tickets: 4 }, { nextOnLastPage: true })
    const params = withPageSink({ page: 1, limit: 4 })
    const rows = await new UnthreadAdapter().listTickets(CREDS, params)
    expect(rows).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('declares the documented maximum', () => {
    expect(new UnthreadAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('API path: parseListQuery → listTickets → listPage reports the next page', async () => {
    fakeUnthread({ tickets: 250 })
    const adapter = new UnthreadAdapter()
    const params = parseListQuery({ limit: '500', page: '2' }, adapter)
    const rows = await adapter.listTickets(CREDS, params)
    const env = listPage(rows, params, 'unthread')
    expect(env.meta.limit).toBe(MAX)
    expect(env.data.map((r) => r.id)).toEqual(
      Array.from({ length: MAX }, (_, i) => `tickets-${MAX + i + 1}`),
    )
    expect(env.meta.hasMore).toBe(true)
  })
})
