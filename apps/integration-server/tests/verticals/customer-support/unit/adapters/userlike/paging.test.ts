/**
 * Userlike (Lime Connect) list paging.
 *
 * From https://docs.lime-connect.com/developers/api/json :
 *
 *   Cursor pagination: "You can provide us with a resource reference in the
 *   cursor query parameter and we will return resources that either come
 *   before or after the cursor, depending on which ordering query parameter
 *   you send. Responses you receive will have a next link and a previous link
 *   with the correct cursor set if there are resources that come before or
 *   after the results list."
 *
 *   Conversation all list endpoint: "this endpoint has cursor-based pagination
 *   ... The conversation id is used as a cursor." (example next link:
 *   ".../v3/conversations/?cursor=223&limit=100&ordering=id" for
 *   ".../v3/conversations/all/?cursor=123&limit=100&ordering=id")
 *
 *   Contact all list endpoint: "this endpoint has cursor-based pagination ...
 *   The contact id is used as a cursor."
 *
 *   Conversation messages: "The conversation messages endpoint uses cursor
 *   based pagination with a maximum page size of 100 messages."
 *
 *   Offset pagination (operators list): "The maximum page size is 100 resource
 *   items. If you provide a limit larger than that, we will fallback to this
 *   limit." Example: `{ "count" : 20 , "next" :
 *   "https://api.userlike.com/api/um/v3/operators/?limit=10&offset=10" ... }`
 *
 * The fake honours ONLY those parameters: `limit` (falling back to 100 above
 * it), `ordering=id` and `cursor` on the cursor endpoints; `limit` and
 * `offset` on /operators/. As in the docs, the /all/ endpoints' next link
 * points at the path WITHOUT `/all/`, so an adapter that follows the link
 * verbatim leaves the endpoint; only its `cursor` value may be carried.
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
import { UserlikeAdapter } from '../../../../../../src/verticals/customer-support/adapters/userlike/index'

const CREDS = { accessToken: 'ul_test' }
/** Documented maximum page size (offset lists and conversation messages). */
const MAX = 100
const BASE = 'https://api.userlike.com/api/um/v3'

type Call = { path: string; params: Record<string, unknown> }

const PATHS = {
  tickets: '/conversations/all/',
  messages: '/conversations/c1/messages/',
  contacts: '/contact_identities/all/',
  users: '/operators/',
} as const
type Resource = keyof typeof PATHS

/** Where each endpoint's documented `next` link points. */
const NEXT_PATH: Record<Resource, string> = {
  tickets: '/conversations/',
  messages: '/conversations/c1/messages/',
  contacts: '/contact_identities/',
  users: '/operators/',
}

function idOf(resource: Resource, i: number): number | string {
  // Messages carry "{conversation}.{part}.{message}" ids; the rest are integers.
  return resource === 'messages' ? `1.1.${i + 1}` : i + 1
}

function row(resource: Resource, i: number): Record<string, unknown> {
  const id = idOf(resource, i)
  if (resource === 'messages') return { id, conversation_id: 1, body: `m${i + 1}` }
  return { id, name: `${resource}-${i + 1}` }
}

function fakeUserlike(sizes: Partial<Record<Resource, number>>) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    calls.push({ path, params })
    const resource = (Object.keys(PATHS) as Resource[]).find((r) => PATHS[r] === path)
    if (!resource) throw new Error(`unexpected GET ${path}`)
    const allowed = resource === 'users' ? ['limit', 'offset'] : ['limit', 'ordering', 'cursor']
    for (const k of Object.keys(params)) {
      if (!allowed.includes(k)) throw new Error(`undocumented query param ${k} on ${path}`)
    }
    const raw = params['limit'] === undefined ? 10 : Number(params['limit'])
    const limit = Math.min(raw, MAX) // "we will fallback to this limit"
    const n = sizes[resource] ?? 0
    const all = Array.from({ length: n }, (_, i) => row(resource, i))

    if (resource === 'users') {
      const offset = Number(params['offset'] ?? 0)
      const results = all.slice(offset, offset + limit)
      const end = offset + results.length
      return {
        data: {
          count: n,
          next: end < n ? `${BASE}${NEXT_PATH[resource]}?limit=${limit}&offset=${end}` : null,
          previous: null,
          results,
        },
      }
    }

    if (params['ordering'] !== 'id') throw new Error('cursor lists need ordering=id')
    // The cursor is a plain id: return the rows that come after it.
    const cursor = params['cursor']
    const start =
      cursor === undefined ? 0 : all.findIndex((r) => String(r['id']) === String(cursor)) + 1
    if (cursor !== undefined && start === 0) throw new Error(`unknown cursor ${String(cursor)}`)
    const results = all.slice(start, start + limit)
    const end = start + results.length
    const last = results[results.length - 1]
    return {
      data: {
        count: n,
        next:
          end < n && last
            ? `${BASE}${NEXT_PATH[resource]}?cursor=${String(last['id'])}&limit=${limit}&ordering=id`
            : null,
        previous: null,
        results,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

type ListFn = (a: UserlikeAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

const LISTS: Array<[string, Resource, ListFn]> = [
  ['listTickets', 'tickets', (a, p) => a.listTickets(CREDS, p)],
  ['listMessages', 'messages', (a, p) => a.listMessages(CREDS, 'c1', p)],
  ['listContacts', 'contacts', (a, p) => a.listContacts(CREDS, p)],
  ['listUsers', 'users', (a, p) => a.listUsers(CREDS, p)],
]

const expectedIds = (resource: Resource, n: number) =>
  Array.from({ length: n }, (_, i) => String(idOf(resource, i)))

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Userlike lists serve every row once, page by page', () => {
  for (const [name, resource, list] of LISTS) {
    it(`${name}: 2L+1 rows over pages 1..3 at limit L, with hasMore exact`, async () => {
      const L = 4
      fakeUserlike({ [resource]: 2 * L + 1 })
      const adapter = new UserlikeAdapter()
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(adapter, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(expectedIds(resource, 2 * L + 1))
      expect(more).toEqual([true, true, false])
    })

    it(`${name}: a limit above the documented 100 is clamped`, async () => {
      const calls = fakeUserlike({ [resource]: 150 })
      const rows = await list(new UserlikeAdapter(), withPageSink({ page: 1, limit: 500 }))
      expect(calls.map((c) => c.params['limit'])).toEqual([MAX])
      expect(rows).toHaveLength(MAX)
    })
  }

  it('listTickets: page 2 sends the next link cursor to /conversations/all/', async () => {
    const calls = fakeUserlike({ tickets: 9 })
    const adapter = new UserlikeAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls).toEqual([
      { path: '/conversations/all/', params: { limit: 4, ordering: 'id' } },
      { path: '/conversations/all/', params: { limit: 4, ordering: 'id', cursor: '4' } },
    ])
  })

  it('listContacts: page 2 sends the next link cursor to /contact_identities/all/', async () => {
    const calls = fakeUserlike({ contacts: 9 })
    const adapter = new UserlikeAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls[1]).toEqual({
      path: '/contact_identities/all/',
      params: { limit: 4, ordering: 'id', cursor: '4' },
    })
  })

  it('listMessages: page 2 sends the next link cursor', async () => {
    const calls = fakeUserlike({ messages: 9 })
    const adapter = new UserlikeAdapter()
    await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 1, limit: 4 }))
    await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 2, limit: 4 }))
    expect(calls[1]).toEqual({
      path: '/conversations/c1/messages/',
      params: { limit: 4, ordering: 'id', cursor: '1.1.4' },
    })
  })

  it('listUsers: page 2 sends offset = limit', async () => {
    const calls = fakeUserlike({ users: 9 })
    await new UserlikeAdapter().listUsers(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls).toEqual([{ path: '/operators/', params: { limit: 4, offset: 4 } }])
  })

  it('listUsers: a clamped limit strides by the size actually sent', async () => {
    const calls = fakeUserlike({ users: 250 })
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await new UserlikeAdapter().listUsers(CREDS, params)
    expect(calls[0]!.params).toEqual({ limit: MAX, offset: MAX })
    expect(rows[0]!.id).toBe('101')
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a cold page 3 walks the cursor chain rather than repeating page 1', async () => {
    fakeUserlike({ tickets: 9 })
    const rows = await new UserlikeAdapter().listTickets(CREDS, withPageSink({ page: 3, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['9'])
  })

  it('messages of different conversations do not share a cursor chain', async () => {
    const calls = fakeUserlike({ messages: 9 })
    const adapter = new UserlikeAdapter()
    await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 1, limit: 4 }))
    await expect(
      adapter.listMessages(CREDS, 'c2', withPageSink({ page: 2, limit: 4 })),
    ).rejects.toThrow(/unexpected GET \/conversations\/c2/)
    expect(calls[1]!.params).toEqual({ limit: 4, ordering: 'id' })
  })

  it('cursors are scoped per connection: another token walks its own chain', async () => {
    const calls = fakeUserlike({ tickets: 9 })
    const adapter = new UserlikeAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listTickets({ accessToken: 'ul_other' }, withPageSink({ page: 2, limit: 4 }))
    expect(calls.slice(1).map((c) => c.params)).toEqual([
      { limit: 4, ordering: 'id' },
      { limit: 4, ordering: 'id', cursor: '4' },
    ])
  })

  it('cursor chains are keyed by limit: a new limit walks its own chain', async () => {
    const calls = fakeUserlike({ tickets: 25 })
    const adapter = new UserlikeAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(calls.slice(1).map((c) => c.params)).toEqual([
      { limit: 10, ordering: 'id' },
      { limit: 10, ordering: 'id', cursor: '10' },
    ])
    expect(rows.map((r) => r.id)).toEqual(expectedIds('tickets', 20).slice(10))
  })

  it('listUsers: exactly 2L rows end on page 2, from the absent next link', async () => {
    const L = 4
    fakeUserlike({ users: 2 * L })
    const adapter = new UserlikeAdapter()
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      await adapter.listUsers(CREDS, params)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('listUsers: reports the documented count as totalCount', async () => {
    fakeUserlike({ users: 20 })
    const params = withPageSink({ page: 1, limit: 10 })
    await new UserlikeAdapter().listUsers(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(20)
  })

  it('declares the documented maximum', () => {
    expect(new UserlikeAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('API path: parseListQuery → listTickets → listPage reports the next page', async () => {
    fakeUserlike({ tickets: 250 })
    const adapter = new UserlikeAdapter()
    const params = parseListQuery({ limit: '500', page: '2' }, adapter)
    const rows = await adapter.listTickets(CREDS, params)
    const env = listPage(rows, params, 'userlike')
    expect(env.meta.limit).toBe(MAX)
    expect(env.data.map((r) => r.id)).toEqual(
      Array.from({ length: MAX }, (_, i) => String(MAX + i + 1)),
    )
    expect(env.meta.hasMore).toBe(true)
  })

  it('API path: parseListQuery → listUsers → listPage on the last page', async () => {
    fakeUserlike({ users: 41 })
    const adapter = new UserlikeAdapter()
    const params = parseListQuery({ limit: '20', page: '3' }, adapter)
    const rows = await adapter.listUsers(CREDS, params)
    const env = listPage(rows, params, 'userlike')
    expect(env.data.map((r) => r.id)).toEqual(['41'])
    expect(env.meta.hasMore).toBe(false)
  })
})
