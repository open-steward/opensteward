/**
 * Primer list paging: 1-based `page` + caller's `limit` → each list
 * endpoint's documented position parameter.
 *
 *   GET /payments             `limit` (1..100, default 100) + opaque `cursor`.
 *                             "To access the next page of result, set the
 *                             `cursor` query parameter to the value of
 *                             `nextCursor` in your current result payload."
 *                             (https://primer.io/docs/api-reference/v2.4/api-reference/payments-api/search-&-list-payments.md)
 *                             Walked with pageByCursor: one upstream page is
 *                             one caller page.
 *   GET /payment-instruments  `customer_id` (required) only; the response is
 *                             `{ data }` with no cursor, limit or page, so the
 *                             whole collection is sliced with pageLocally.
 *                             Without `customer_id` the adapter refuses with
 *                             501 before sending anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { PrimerAdapter } from '../../../../../../src/verticals/payments/adapters/primer/index'

const MAX = 100

const CREDS: Credentials = { accessToken: 'primer_key_a' }

interface Sent {
  path: string
  params: Record<string, unknown>
  apiKey: string
}

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

function unprocessable(msg: string): Error {
  return Object.assign(new Error(`422 ${msg}`), { response: { status: 422 } })
}

/**
 * Opaque to the adapter: the fake decodes it, nothing else should. Like a real
 * cursor it is bound to the walk that minted it (api key, limit, status
 * filter): replaying it on another connection, page size or filter is a 422,
 * so a pager key that is too coarse fails loudly instead of serving rows.
 */
interface CursorState {
  k: string
  l: number
  s: string | null
  o: number
}
const encodeCursor = (state: CursorState) => Buffer.from(JSON.stringify(state)).toString('base64')
function decodeCursor(raw: unknown, walk: Omit<CursorState, 'o'>): number {
  let state: CursorState
  try {
    state = JSON.parse(Buffer.from(String(raw), 'base64').toString()) as CursorState
  } catch {
    throw unprocessable(`cursor ${String(raw)}`)
  }
  if (state.k !== walk.k || state.l !== walk.l || state.s !== walk.s)
    throw unprocessable(`cursor ${String(raw)} was minted for another query`)
  return state.o
}

/**
 * A fake Primer holding `n` payments (prefix per api key) and `n` payment
 * instruments for customer `cus_1`, which reads ONLY the documented params.
 */
function fakePrimer(n: number, opts: { prefixByKey?: Record<string, string> } = {}) {
  const sent: Sent[] = []
  const instruments = makeIds('tok', n).map((token) => ({
    token,
    tokenType: 'MULTI_USE',
    paymentMethodType: 'PAYMENT_CARD',
    customerId: 'cus_1',
  }))
  const makeGet = (apiKey: string) =>
    vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const q = { ...(config?.params ?? {}) }
      sent.push({ path, params: q, apiKey })
      if (path === '/payments') {
        const status = q.status === undefined ? null : String(q.status)
        // Every third payment is DECLINED; the rest are SETTLED.
        const payments = makeIds(opts.prefixByKey?.[apiKey] ?? 'pay', n)
          .map((id, i) => ({ id, status: i % 3 === 2 ? 'DECLINED' : 'SETTLED' }))
          .filter((p) => status === null || p.status === status)
        const limit = q.limit === undefined ? 100 : Number(q.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
          throw unprocessable(`limit ${String(q.limit)}`)
        const walk = { k: apiKey, l: limit, s: status }
        const offset = q.cursor === undefined ? 0 : decodeCursor(q.cursor, walk)
        const rows = payments.slice(offset, offset + limit).map((p) => ({
          ...p,
          amount: 1000,
          currencyCode: 'USD',
          date: '2026-01-01T00:00:00Z',
        }))
        const end = offset + limit
        return {
          data: {
            data: rows,
            ...(end < payments.length ? { nextCursor: encodeCursor({ ...walk, o: end }) } : {}),
          },
        }
      }
      if (path === '/payment-instruments') {
        if (!q.customer_id) throw unprocessable('customer_id is required')
        return { data: { data: q.customer_id === 'cus_1' ? instruments : [] } }
      }
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    })
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const apiKey = String(config?.headers?.['X-Api-Key'] ?? '')
    return { get: makeGet(apiKey), post: vi.fn() }
  }) as never)
  return { sent }
}

type Method = 'listCharges' | 'listPaymentMethods'

async function callPage(
  adapter: PrimerAdapter,
  method: Method,
  page: number,
  limit: number,
  creds: Credentials = CREDS,
  extra: Record<string, unknown> = {},
) {
  const params = withPageSink({ page, limit, ...extra } as QueryParams)
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Primer listCharges paging (GET /payments, cursor)', () => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    fakePrimer(2 * L + 1)
    const adapter = new PrimerAdapter()
    const p1 = await callPage(adapter, 'listCharges', 1, L)
    const p2 = await callPage(adapter, 'listCharges', 2, L)
    const p3 = await callPage(adapter, 'listCharges', 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds('pay', 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    const p4 = await callPage(adapter, 'listCharges', 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('page 2 sends cursor = page 1 nextCursor, with the same limit', async () => {
    const L = 4
    const { sent } = fakePrimer(10)
    const adapter = new PrimerAdapter()
    await callPage(adapter, 'listCharges', 1, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.params).toEqual({ limit: L })
    sent.length = 0
    const p2 = await callPage(adapter, 'listCharges', 2, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      path: '/payments',
      params: { limit: L, cursor: encodeCursor({ k: 'primer_key_a', l: L, s: null, o: L }) },
    })
    expect(p2.ids).toEqual(makeIds('pay', 10).slice(L, 2 * L))
  })

  it('a cold page 3 walks the cursor chain from page 1', async () => {
    const L = 2
    const { sent } = fakePrimer(7)
    const p3 = await callPage(new PrimerAdapter(), 'listCharges', 3, L)
    expect(p3.ids).toEqual(makeIds('pay', 7).slice(4, 6))
    expect(p3.hasMore).toBe(true)
    const walk = { k: 'primer_key_a', l: L, s: null }
    expect(sent.map((s) => s.params.cursor)).toEqual([
      undefined,
      encodeCursor({ ...walk, o: 2 }),
      encodeCursor({ ...walk, o: 4 }),
    ])
  })

  it('clamps a limit above the maximum and still serves every row', async () => {
    const n = 2 * MAX + 1
    const { sent } = fakePrimer(n)
    const adapter = new PrimerAdapter()
    const pages = []
    for (let k = 1; k <= 4; k++) pages.push(await callPage(adapter, 'listCharges', k, 1000))
    expect(sent.every((s) => Number(s.params.limit) === MAX)).toBe(true)
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds('pay', n))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false, false])
  })

  it('keeps each connection on its own cursor walk', async () => {
    const { sent } = fakePrimer(9, { prefixByKey: { key_a: 'A', key_b: 'B' } })
    const adapter = new PrimerAdapter()
    await callPage(adapter, 'listCharges', 1, 3, { accessToken: 'key_a' })
    sent.length = 0
    const b2 = await callPage(adapter, 'listCharges', 2, 3, { accessToken: 'key_b' })
    expect(b2.ids).toEqual(makeIds('B', 9).slice(3, 6))
    expect(sent.every((s) => s.apiKey === 'key_b')).toBe(true)
    // key_b walked its own chain from page 1 rather than replaying A's cursor.
    expect(sent.map((s) => s.params.cursor)).toEqual([
      undefined,
      encodeCursor({ k: 'key_b', l: 3, s: null, o: 3 }),
    ])
  })

  it('does not reuse a cursor walk across page sizes', async () => {
    const { sent } = fakePrimer(12)
    const adapter = new PrimerAdapter()
    await callPage(adapter, 'listCharges', 1, 3)
    await callPage(adapter, 'listCharges', 2, 3)
    sent.length = 0
    const p2 = await callPage(adapter, 'listCharges', 2, 4)
    expect(p2.ids).toEqual(makeIds('pay', 12).slice(4, 8))
    expect(sent.map((s) => s.params)).toEqual([
      { limit: 4 },
      { limit: 4, cursor: encodeCursor({ k: 'primer_key_a', l: 4, s: null, o: 4 }) },
    ])
  })

  it('does not reuse a cursor walk across status filters', async () => {
    const { sent } = fakePrimer(12)
    const adapter = new PrimerAdapter()
    await callPage(adapter, 'listCharges', 1, 2)
    await callPage(adapter, 'listCharges', 2, 2)
    sent.length = 0
    const declined = await callPage(adapter, 'listCharges', 2, 2, CREDS, { status: 'DECLINED' })
    // DECLINED rows are every third payment: pay_0003, 0006, 0009, 0012.
    expect(declined.ids).toEqual(['pay_0009', 'pay_0012'])
    expect(declined.hasMore).toBe(false)
    expect(sent.map((s) => s.params)).toEqual([
      { limit: 2, status: 'DECLINED' },
      {
        limit: 2,
        status: 'DECLINED',
        cursor: encodeCursor({ k: 'primer_key_a', l: 2, s: 'DECLINED', o: 2 }),
      },
    ])
  })

  it('raises a limit below the documented minimum of 1 to 1', async () => {
    const { sent } = fakePrimer(3)
    const p1 = await callPage(new PrimerAdapter(), 'listCharges', 1, 0)
    expect(sent.map((s) => s.params)).toEqual([{ limit: 1 }])
    expect(p1.ids).toEqual(['pay_0001'])
    expect(p1.hasMore).toBe(true)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakePrimer(5)
    const adapter = new PrimerAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items: unknown[] = await adapter.listCharges(CREDS, params)
      return listPage(items, params, 'primer')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r2 = await run(2)
    expect(r2.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })

  it('declares maxPageSize 100, the documented limit maximum', () => {
    const adapter = new PrimerAdapter()
    expect(adapter.capabilities.maxPageSize).toBe(MAX)
    const params = parseListQuery({ limit: '500' }, adapter as PageMaxBearing)
    expect(params.limit).toBe(MAX)
  })
})

describe('Primer listPaymentMethods paging (GET /payment-instruments, unpaginated)', () => {
  const forCustomer = { customer_id: 'cus_1' }

  it('serves 2L+1 rows over three pages from one whole-collection fetch, with exact hasMore', async () => {
    const L = 3
    const { sent } = fakePrimer(2 * L + 1)
    const adapter = new PrimerAdapter()
    const p1 = await callPage(adapter, 'listPaymentMethods', 1, L, CREDS, forCustomer)
    const p2 = await callPage(adapter, 'listPaymentMethods', 2, L, CREDS, forCustomer)
    const p3 = await callPage(adapter, 'listPaymentMethods', 3, L, CREDS, forCustomer)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds('tok', 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect(readUpstreamPage(p1.params)?.pagedLocally).toBe(true)
    // Only the documented parameter is sent: no limit, cursor or page.
    expect(sent.every((s) => JSON.stringify(s.params) === JSON.stringify(forCustomer))).toBe(true)
  })

  it('a limit above 100 still serves every row', async () => {
    const n = 2 * MAX + 1
    fakePrimer(n)
    const adapter = new PrimerAdapter()
    const p1 = await callPage(adapter, 'listPaymentMethods', 1, 1000, CREDS, forCustomer)
    expect(p1.ids).toEqual(makeIds('tok', n))
    expect(p1.hasMore).toBe(false)
  })

  it('refuses with 501 NOT_SUPPORTED, sending nothing, when customer_id is absent', async () => {
    const { sent } = fakePrimer(3)
    const adapter = new PrimerAdapter()
    const params = parseListQuery({ limit: '2' }, adapter as PageMaxBearing)
    await expect(adapter.listPaymentMethods(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage (customer_id supplied)', async () => {
    fakePrimer(5)
    const adapter = new PrimerAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      params['customer_id'] = 'cus_1'
      const items: unknown[] = await adapter.listPaymentMethods(CREDS, params)
      return listPage(items, params, 'primer')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})
