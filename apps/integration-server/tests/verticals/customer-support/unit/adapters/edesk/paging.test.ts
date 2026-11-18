import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { EdeskClient } from '../../../../../../src/verticals/customer-support/adapters/edesk/client'
import { EdeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/edesk/index'

/**
 * Paging against eDesk's documented contract
 * (https://developers.edesk.com/reference/pagination):
 *
 *   "To paginate through the response of a list request, you can pass the
 *   `page` query parameter. For more precision, you can also add the
 *   `itemsPerPage` parameter. List responses contain the `paginator` object"
 *
 * with `paginator: { totalItemsCount, currentPage, itemsPerPage }`. No page
 * maximum is documented, so none is declared and none is clamped to.
 *
 * The fake honours ONLY `page` and `itemsPerPage`. listMessages is
 * covered in messages.test.ts (Read Ticket messages_ids + Read Message).
 */

const CREDS = { accessToken: 'tok' } as unknown as Credentials
const FAKE_DEFAULT_PER_PAGE = 10

interface Call {
  path: string
  params: Record<string, unknown>
}

function fakeEdesk(n: number) {
  const calls: Call[] = []
  const collections: Record<string, Array<Record<string, unknown>>> = {
    '/tickets': Array.from({ length: n }, (_, i) => ({
      id: 100 + i,
      status: 'Open',
      created_at: '2026-01-01T00:00:00Z',
    })),
    '/contacts': Array.from({ length: n }, (_, i) => ({ id: 200 + i, name: `C${i}` })),
    '/users': Array.from({ length: n }, (_, i) => ({ id: 300 + i, email: `u${i}@x.test` })),
    '/tags': Array.from({ length: n }, (_, i) => ({ id: 400 + i, name: `T${i}` })),
  }
  const spy = vi
    .spyOn(EdeskClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      const p = params ?? {}
      calls.push({ path, params: p })
      const rows = collections[path]
      if (!rows) throw new Error(`unexpected path ${path}`)
      const page = typeof p['page'] === 'number' ? p['page'] : 1
      const per = typeof p['itemsPerPage'] === 'number' ? p['itemsPerPage'] : FAKE_DEFAULT_PER_PAGE
      return {
        paginator: { totalItemsCount: rows.length, currentPage: page, itemsPerPage: per },
        data: rows.slice((page - 1) * per, page * per),
      } as never
    })
  return { calls, spy }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new EdeskAdapter()

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

const METHODS: Array<{ name: string; path: string; base: number; list: Lister }> = [
  { name: 'listTickets', path: '/tickets', base: 100, list: (p) => adapter.listTickets(CREDS, p) },
  {
    name: 'listContacts',
    path: '/contacts',
    base: 200,
    list: (p) => adapter.listContacts(CREDS, p),
  },
  { name: 'listUsers', path: '/users', base: 300, list: (p) => adapter.listUsers(CREDS, p) },
  { name: 'listTags', path: '/tags', base: 400, list: (p) => adapter.listTags(CREDS, p) },
]

describe.each(METHODS)('EdeskAdapter.$name pages', ({ path, base, list }) => {
  const L = 3
  const N = 2 * L + 1
  const ids = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => String(base + from + i))

  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    fakeEdesk(N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(0, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('takes hasMore from totalItemsCount, not a full page, when the collection ends on a page boundary', async () => {
    fakeEdesk(2 * L)
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      expect(rows).toHaveLength(L)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('sends the documented page and itemsPerPage on page 2', async () => {
    const { calls } = fakeEdesk(N)
    await list(withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe(path)
    expect(calls[0]!.params['page']).toBe(2)
    expect(calls[0]!.params['itemsPerPage']).toBe(L)
  })

  it('reports the paginator totalItemsCount', async () => {
    fakeEdesk(N)
    const params = withPageSink({ page: 1, limit: L })
    await list(params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('serves page 2 through parseListQuery and listPage on the API path', async () => {
    fakeEdesk(N)
    const params = parseListQuery(
      { page: '2', limit: String(L) },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await list(params), params, 'edesk')
    expect(env.data.map((r) => r.id)).toEqual(ids(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('EdeskAdapter page number normalisation', () => {
  it('reads a legacy numeric cursor as the page when page is absent', async () => {
    const { calls } = fakeEdesk(7)
    await adapter.listTags(CREDS, { cursor: '2', limit: 3 } as QueryParams)
    expect(calls[0]!.params['page']).toBe(2)
  })

  it('asks for page 1 when neither page nor cursor is given', async () => {
    const { calls } = fakeEdesk(7)
    await adapter.listTags(CREDS, { limit: 3 } as QueryParams)
    expect(calls[0]!.params['page']).toBe(1)
  })

  it('prefers the caller page over a legacy cursor', async () => {
    const { calls } = fakeEdesk(7)
    await adapter.listTags(CREDS, { page: 3, cursor: '2', limit: 3 } as QueryParams)
    expect(calls[0]!.params['page']).toBe(3)
  })
})

describe('EdeskAdapter declares no page maximum', () => {
  // eDesk documents no ceiling for itemsPerPage, so there is nothing to clamp
  // a large limit to; the limit is sent as is.
  it('leaves maxPageSize undeclared and sends the caller limit', async () => {
    const caps = (adapter as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
    const { calls } = fakeEdesk(7)
    await adapter.listTickets(CREDS, { page: 1, limit: 250 } as QueryParams)
    expect(calls[0]!.params['itemsPerPage']).toBe(250)
  })
})
