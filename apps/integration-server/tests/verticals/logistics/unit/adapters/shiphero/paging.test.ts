/**
 * ShipHero paging.
 *
 * `orders` and `shipments` are Relay connections: the root field takes filters
 * only, and `first` / `after` are arguments of the nested `data` field
 * (developer.shiphero.com/schema/types/orders-query-result.html,
 * .../shipments-query-result.html). PageInfo: "endCursor String When paginating
 * forwards, the cursor to continue." and "hasNextPage Boolean ! When paginating
 * forwards, are there more items?" (developer.shiphero.com/schema/types/page-info.html).
 *
 * The fake below honours ONLY `first` and `after` on `data`, and answers with
 * `pageInfo { hasNextPage endCursor }`. No maximum `first` is documented for
 * these connections — only "If first and last are omitted, the default maximum
 * of 100 is applied" (developer.shiphero.com/getting-started/) — so the adapter
 * declares no maxPageSize and there is no clamp to test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import { ShipheroAdapter } from '../../../../../../src/verticals/logistics/adapters/shiphero/index'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' }

interface Call {
  query: string
  variables: Record<string, unknown>
}

type Root = 'orders' | 'shipments'

function node(root: Root, id: string): Record<string, unknown> {
  return root === 'orders'
    ? { id, legacy_id: 1, order_number: id, fulfillment_status: 'pending', line_items: [] }
    : { id, legacy_id: 1, order_id: 'o', status: 'shipped', created_at: '2024-01-01T00:00:00Z' }
}

/**
 * Serves every root in `roots` from one mocked client, so a test can drive
 * orders and shipments (or two connections) without resetting the pager.
 * `calls` records every request; `callsFor(root)` only that root's.
 */
function relayFake(roots: Root | Root[], total: number) {
  const served = Array.isArray(roots) ? roots : [roots]
  const calls: Array<Call & { root: Root }> = []
  const post = vi.fn(async (_path: string, body: Call) => {
    const root = served.find((r) => body.query.includes(`${r} {`))
    if (!root) throw new Error(`unexpected query ${body.query}`)
    calls.push({ ...body, root })
    const ids = Array.from({ length: total }, (_, i) => `${root}-${i + 1}`)
    // `first` omitted → the documented default of 100.
    const first = typeof body.variables.first === 'number' ? body.variables.first : 100
    const after = body.variables.after as string | undefined
    const start = after ? Number(after.replace('cur-', '')) : 0
    const end = Math.min(start + first, ids.length)
    return {
      data: {
        data: {
          [root]: {
            request_id: 'r',
            data: {
              edges: ids.slice(start, end).map((id) => ({ node: node(root, id) })),
              pageInfo: { hasNextPage: end < ids.length, endCursor: end > 0 ? `cur-${end}` : null },
            },
          },
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    post,
    defaults: { headers: { common: {} } },
  } as never)
  const callsFor = (root: Root) => calls.filter((c) => c.root === root)
  return { calls, callsFor }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const L = 3
const N = 2 * L + 1

const cases: Array<{ root: Root; method: 'listOrders' | 'listShipments' }> = [
  { root: 'orders', method: 'listOrders' },
  { root: 'shipments', method: 'listShipments' },
]

for (const { root, method } of cases) {
  describe(`${method}: Relay first/after on data`, () => {
    it('pages 1..3 of 2L+1 rows return every id once, in order, with hasMore exact', async () => {
      relayFake(root, N)
      const adapter = new ShipheroAdapter()
      const seen: string[] = []
      const more: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await adapter[method](CREDS, params)
        seen.push(...rows.map((r) => r.id as string))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${root}-${i + 1}`))
      expect(more).toEqual([true, true, false])
    })

    it('the page-2 request carries after = page 1 endCursor and first = the caller limit', async () => {
      const { calls } = relayFake(root, N)
      const adapter = new ShipheroAdapter()
      await adapter[method](CREDS, withPageSink({ page: 1, limit: L }))
      await adapter[method](CREDS, withPageSink({ page: 2, limit: L }))
      expect(calls).toHaveLength(2)
      expect(calls[1].variables).toEqual({ first: L, after: `cur-${L}` })
    })

    it('a cold page 2 walks from page 1', async () => {
      const { calls } = relayFake(root, N)
      const rows = await new ShipheroAdapter()[method](CREDS, withPageSink({ page: 2, limit: L }))
      expect(rows.map((r) => r.id)).toEqual([`${root}-4`, `${root}-5`, `${root}-6`])
      expect(calls).toHaveLength(2)
      expect(calls[0].variables).toEqual({ first: L })
    })

    it('an explicit cursor is sent as after without a walk, and reports hasMore', async () => {
      const { calls } = relayFake(root, N)
      const adapter = new ShipheroAdapter()
      const mid = withPageSink({ limit: L, cursor: 'cur-3' })
      const rows = await adapter[method](CREDS, mid)
      expect(rows.map((r) => r.id)).toEqual([`${root}-4`, `${root}-5`, `${root}-6`])
      expect(calls).toHaveLength(1)
      expect(calls[0].variables).toEqual({ first: L, after: 'cur-3' })
      expect(readUpstreamPage(mid)?.hasMore).toBe(true)

      const last = withPageSink({ limit: L, cursor: 'cur-6' })
      const tail = await adapter[method](CREDS, last)
      expect(tail.map((r) => r.id)).toEqual([`${root}-7`])
      expect(readUpstreamPage(last)?.hasMore).toBe(false)
    })

    it('the pager key includes the limit: a cold page 2 at another limit walks afresh', async () => {
      const { calls } = relayFake(root, N)
      const adapter = new ShipheroAdapter()
      await adapter[method](CREDS, withPageSink({ page: 2, limit: L }))
      calls.length = 0
      const rows = await adapter[method](CREDS, withPageSink({ page: 2, limit: 2 }))
      expect(rows.map((r) => r.id)).toEqual([`${root}-3`, `${root}-4`])
      expect(calls.map((c) => c.variables)).toEqual([{ first: 2 }, { first: 2, after: 'cur-2' }])
    })

    it('the pager key is per connection: another token walks from page 1', async () => {
      const { calls } = relayFake(root, N)
      const adapter = new ShipheroAdapter()
      await adapter[method](CREDS, withPageSink({ page: 2, limit: L }))
      calls.length = 0
      const other = { accessToken: 'tok-b', refreshToken: 'rt-b' }
      const rows = await adapter[method](other, withPageSink({ page: 2, limit: L }))
      expect(rows.map((r) => r.id)).toEqual([`${root}-4`, `${root}-5`, `${root}-6`])
      expect(calls.map((c) => c.variables)).toEqual([{ first: L }, { first: L, after: `cur-${L}` }])
    })

    it('API path: parseListQuery → adapter → listPage reports hasMore', async () => {
      relayFake(root, N)
      const adapter = new ShipheroAdapter()
      const params = parseListQuery({ page: '3', limit: String(L) })
      const rows: Array<{ id?: string }> = await adapter[method](CREDS, params)
      const env = listPage(rows, params, 'shiphero')
      expect(env.data.map((r) => r.id)).toEqual([`${root}-7`])
      expect(env.meta.hasMore).toBe(false)
      const params2 = parseListQuery({ page: '2', limit: String(L) })
      const rows2: Array<{ id?: string }> = await adapter[method](CREDS, params2)
      const env2 = listPage(rows2, params2, 'shiphero')
      expect(env2.data.map((r) => r.id)).toEqual([`${root}-4`, `${root}-5`, `${root}-6`])
      expect(env2.meta.hasMore).toBe(true)
    })
  })
}

describe('pager key is per collection', () => {
  it('a cold shipments page 2 after an orders walk starts from shipments page 1', async () => {
    const { callsFor } = relayFake(['orders', 'shipments'], N)
    const adapter = new ShipheroAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    const rows = await adapter.listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['shipments-4', 'shipments-5', 'shipments-6'])
    expect(callsFor('shipments').map((c) => c.variables)).toEqual([
      { first: L },
      { first: L, after: `cur-${L}` },
    ])
  })
})
