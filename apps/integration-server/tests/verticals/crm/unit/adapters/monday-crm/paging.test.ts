/**
 * monday.com board list paging: 1-based `page` + caller's `limit` → the
 * `items_page(limit, cursor)` cursor chain, with `hasMore` from
 * `items_page.cursor`.
 *
 * From https://developer.monday.com/api-reference/reference/items-page:
 *
 *   "An opaque token representing the position in a set of results to fetch
 *    items from. Use this to paginate through large result sets. | The number
 *    of items to return. The default is 25, but the maximum is 500. | An
 *    opaque cursor that represents the position in the list after the last
 *    returned item. Use this cursor for pagination to fetch the next set of
 *    items."
 *   "If the cursor is null , there are no more items to fetch."
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MondayCrmAdapter } from '../../../../../../src/verticals/crm/adapters/monday-crm/index'

/** Documented: "The default is 25, but the maximum is 500." */
const MAX = 500
const DEFAULT = 25

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

const CASES: { method: Method; board: string }[] = [
  { method: 'listContacts', board: 'b-contacts' },
  { method: 'listCompanies', board: 'b-companies' },
  { method: 'listDeals', board: 'b-deals' },
  { method: 'listActivities', board: 'b-activities' },
]

const CREDS = {
  accessToken: 'monday_test',
  extra: {
    contactBoardId: 'b-contacts',
    companyBoardId: 'b-companies',
    dealBoardId: 'b-deals',
    activityBoardId: 'b-activities',
  },
}

/** The only variables items_page takes, plus the board id it is nested under. */
const DOCUMENTED = new Set(['boardId', 'limit', 'cursor'])

interface Sent {
  boardId: string
  limit: number | undefined
  cursor: string | undefined
}

/**
 * A fake monday.com GraphQL endpoint whose `items_page` honours ONLY `limit`
 * (1..500, default 25) and `cursor` (opaque, from a previous
 * `items_page.cursor`). The cursor is bound to the board and size that minted
 * it. Any other variable is refused.
 */
function fakeMonday(total: number) {
  const sent: Sent[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) !== 'https://api.monday.com/v2' || init?.method !== 'POST') {
      return new Response('unexpected', { status: 404 })
    }
    const body = JSON.parse(String(init.body)) as {
      query: string
      variables: Record<string, unknown>
    }
    if (!body.query.includes('items_page(limit: $limit, cursor: $cursor)')) {
      return new Response('unexpected query', { status: 400 })
    }
    const v = body.variables
    for (const k of Object.keys(v)) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown variable ${k}`, { status: 400 })
    }
    const boardId = String(v['boardId'])
    const limit = v['limit'] === undefined ? DEFAULT : Number(v['limit'])
    const cursor = v['cursor'] as string | undefined
    sent.push({ boardId, limit: v['limit'] as number | undefined, cursor })
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return Response.json({ errors: [{ message: `limit must be 1..${MAX}` }] })
    }
    let offset = 0
    if (cursor !== undefined && cursor !== null) {
      const [cb, co] = Buffer.from(cursor, 'base64url').toString().split('|')
      if (cb !== boardId) return Response.json({ errors: [{ message: 'bad cursor' }] })
      offset = Number(co)
    }
    const end = Math.min(offset + limit, total)
    const items = Array.from({ length: end - offset }, (_, i) => ({
      id: String(offset + i + 1),
      name: `r${offset + i + 1}`,
      column_values: [],
    }))
    const next = end < total ? Buffer.from(`${boardId}|${end}`).toString('base64url') : null
    return Response.json({ data: { boards: [{ items_page: { cursor: next, items } }] } })
  })
  return { sent }
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

async function call(method: Method, params: QueryParams): Promise<{ id: string }[]> {
  return (await new MondayCrmAdapter()[method](CREDS, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('monday-crm $method paging', ({ method, board }) => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { sent } = fakeMonday(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent).toHaveLength(3)
    expect(sent.every((s) => s.boardId === board && s.limit === L)).toBe(true)
  })

  it('the page-2 request carries the cursor from items_page.cursor', async () => {
    const { sent } = fakeMonday(11)
    await call(method, withPageSink({ page: 1, limit: 5 }))
    await call(method, withPageSink({ page: 2, limit: 5 }))
    expect(sent).toHaveLength(2)
    expect(sent[0]!.cursor).toBeUndefined()
    expect(sent[1]!.cursor).toBe(Buffer.from(`${board}|5`).toString('base64url'))
  })

  it('page 2 cold walks from page 1', async () => {
    fakeMonday(11)
    expect((await call(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
      ids(6, 5),
    )
  })

  it('a limit above 500 is clamped and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeMonday(total)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 750 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((s) => s.limit === MAX)).toBe(true)
  })

  it('a clamped window reports the 500 it sent as pageSize', async () => {
    fakeMonday(2 * MAX + 1)
    const params = withPageSink({ page: 1, limit: 750 })
    expect(await call(method, params)).toHaveLength(MAX)
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('no limit sends the documented default of 25', async () => {
    const { sent } = fakeMonday(30)
    expect(await call(method, {})).toHaveLength(DEFAULT)
    expect(sent[0]!.limit).toBe(DEFAULT)
  })

  it('a fractional limit is floored to an integer the API accepts', async () => {
    const { sent } = fakeMonday(11)
    expect((await call(method, withPageSink({ page: 1, limit: 5.7 }))).map((r) => r.id)).toEqual(
      ids(1, 5),
    )
    expect(sent[0]!.limit).toBe(5)
  })

  it('the API path (parseListQuery → listPage) reports meta.hasMore', async () => {
    fakeMonday(11)
    const adapter = new MondayCrmAdapter()
    const p1 = parseListQuery({ page: '1', limit: '5' })
    const env1 = listPage<{ id: string }>(await adapter[method](CREDS, p1), p1, 'monday-crm')
    expect(env1.data).toHaveLength(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '5' })
    const env3 = listPage<{ id: string }>(await adapter[method](CREDS, p3), p3, 'monday-crm')
    expect(env3.data.map((r) => r.id)).toEqual(['11'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a full last page reports hasMore false on the API path', async () => {
    fakeMonday(10)
    const adapter = new MondayCrmAdapter()
    const p2 = parseListQuery({ page: '2', limit: '5' })
    const env = listPage<{ id: string }>(await adapter[method](CREDS, p2), p2, 'monday-crm')
    expect(env.data).toHaveLength(5)
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('monday-crm pager keys', () => {
  it('two boards on one connection do not share cursors', async () => {
    const { sent } = fakeMonday(11)
    await call('listContacts', withPageSink({ page: 1, limit: 5 }))
    const deals = await call('listDeals', withPageSink({ page: 2, limit: 5 }))
    expect(deals.map((r) => r.id)).toEqual(ids(6, 5))
    // Deals page 2 walked its own page 1 rather than reusing the contacts cursor.
    expect(sent.map((s) => [s.boardId, s.cursor === undefined])).toEqual([
      ['b-contacts', true],
      ['b-deals', true],
      ['b-deals', false],
    ])
  })

  it('two connections on the same board do not share cursors', async () => {
    const { sent } = fakeMonday(11)
    const adapter = new MondayCrmAdapter()
    const credsB = { ...CREDS, accessToken: 'monday_other' }
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5 }))
    const b = (await adapter.listContacts(credsB, withPageSink({ page: 2, limit: 5 }))) as {
      id: string
    }[]
    expect(b.map((r) => r.id)).toEqual(ids(6, 5))
    // Connection B walked its own page 1 rather than reusing A's cursor.
    expect(sent.map((s) => s.cursor === undefined)).toEqual([true, true, false])
  })

  it('two page sizes on one board do not share cursors', async () => {
    const { sent } = fakeMonday(25)
    await call('listContacts', withPageSink({ page: 1, limit: 5 }))
    const p2 = await call('listContacts', withPageSink({ page: 2, limit: 10 }))
    expect(p2.map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent.map((s) => [s.limit, s.cursor === undefined])).toEqual([
      [5, true],
      [10, true],
      [10, false],
    ])
  })
})
