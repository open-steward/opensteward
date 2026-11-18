/**
 * Yoco reads, against fakes of the Yoco API
 * (https://developer.yoco.com/openapi/yoco-api-reference.json).
 *
 * The fakes honour only documented parameters: `cursor` and `limit`
 * (integer 1..100, default 50), answering `{ data, next_cursor }` with
 * `next_cursor: null` on the last page
 * (https://developer.yoco.com/docs/api/pagination.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { YocoAdapter } from '../../../../../../src/verticals/payments/adapters/yoco'
import { API_BASE_URL } from '../../../../../../src/verticals/payments/adapters/yoco/constants'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { RefundSchema } from '../../../../../../src/verticals/payments/schema/refund'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import { BalanceTransactionSchema } from '../../../../../../src/verticals/payments/schema/balance-transaction'
import { PAYMENT, PAYOUT, PAYOUT_ENTRY, REFUND } from './fixtures'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/yoco/client', () => ({
  YocoClient: class {
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const CREDS: Credentials = { accessToken: 'yoco-key' }
const LIST_PARAMS = new Set(['cursor', 'limit'])

/** A documented cursor list over `rows`: cursor is the index of the next row. */
function cursorList(rows: readonly unknown[], q: Record<string, unknown> = {}) {
  for (const k of Object.keys(q))
    if (!LIST_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
  const limit = q.limit === undefined ? 50 : Number(q.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error(`limit out of range: ${limit}`)
  const start =
    q.cursor === undefined ? 0 : Number(Buffer.from(String(q.cursor), 'base64').toString())
  const data = rows.slice(start, start + limit)
  const end = start + data.length
  return {
    data,
    next_cursor: end < rows.length ? Buffer.from(String(end)).toString('base64') : null,
  }
}

const payments = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...PAYMENT, id: `pay-${i}` }))
const refunds = (n: number) => Array.from({ length: n }, (_, i) => ({ ...REFUND, id: `rf-${i}` }))
const payouts = (n: number) => Array.from({ length: n }, (_, i) => ({ ...PAYOUT, id: `po-${i}` }))

async function walk<T extends { id: string }>(
  call: (p: QueryParams) => Promise<T[]>,
  limit: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined> }> {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= 20; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(params)
    ids.push(...rows.map((r) => r.id))
    const more = readUpstreamPage(params)?.hasMore
    hasMore.push(more)
    if (!more) break
  }
  return { ids, hasMore }
}

describe('yoco adapter reads', () => {
  const adapter = new YocoAdapter()

  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    _resetCursorPager()
  })

  it('targets the Yoco API host, not the Checkout API host', () => {
    expect(API_BASE_URL).toBe('https://api.yoco.com')
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })

  describe.each([
    ['listCharges', '/v1/payments/', payments, ChargeSchema],
    ['listRefunds', '/v1/refunds/', refunds, RefundSchema],
    ['listPayouts', '/v1/payouts/', payouts, PayoutSchema],
  ] as const)('%s', (method, path, make, schema) => {
    it(`walks ${path} by cursor: 2L+1 rows, every id once, hasMore exact`, async () => {
      const L = 3
      const rows = make(2 * L + 1)
      getMock.mockImplementation(async (p: string, q: Record<string, unknown>) => {
        expect(p).toBe(path)
        return cursorList(rows, q)
      })
      const { ids, hasMore } = await walk(
        (params) =>
          (adapter[method] as (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>)(
            CREDS,
            params,
          ),
        L,
      )
      expect(ids).toEqual(rows.map((r) => r.id))
      expect(hasMore).toEqual([true, true, false])
      // One request per page on a sequential walk, each at the caller's limit.
      expect(getMock).toHaveBeenCalledTimes(3)
      for (const call of getMock.mock.calls) expect(call[1]).toMatchObject({ limit: L })
    })

    it('parses each row with the canonical schema', async () => {
      getMock.mockResolvedValue(cursorList(make(2)))
      const out = await (adapter[method] as (c: Credentials, p: QueryParams) => Promise<unknown[]>)(
        CREDS,
        { limit: 10 },
      )
      for (const row of out) expect(() => schema.parse(row)).not.toThrow()
    })

    it('clamps the limit to the documented maximum of 100 and reports the size sent', async () => {
      getMock.mockImplementation(async (_p: string, q: Record<string, unknown>) =>
        cursorList(make(1), q),
      )
      const params = withPageSink({ page: 1, limit: 250 })
      await (adapter[method] as (c: Credentials, p: QueryParams) => Promise<unknown[]>)(
        CREDS,
        params,
      )
      expect(getMock.mock.calls[0]![1]).toEqual({ limit: 100 })
      expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: false })
    })

    it('sends no date filter for updatedAfter (a lone bound truncates to 31 days)', async () => {
      getMock.mockImplementation(async (_p: string, q: Record<string, unknown>) =>
        cursorList(make(1), q),
      )
      await (adapter[method] as (c: Credentials, p: QueryParams) => Promise<unknown[]>)(CREDS, {
        limit: 5,
        updatedAfter: new Date('2024-01-01T00:00:00Z'),
      } as QueryParams)
      expect(Object.keys(getMock.mock.calls[0]![1] as object)).toEqual(['limit'])
    })
  })

  it('rejects a body that is not the documented { data, next_cursor } envelope', async () => {
    getMock.mockResolvedValue({ access_token: 'x' })
    await expect(adapter.listCharges(CREDS, { limit: 5 })).rejects.toThrow(/no data array/)
    await expect(adapter.listBalanceTransactions(CREDS, { limit: 5 })).rejects.toThrow(
      /no data array/,
    )
  })

  it('getCharge reads GET /v1/payments/{payment_id}', async () => {
    getMock.mockResolvedValue(PAYMENT)
    const c = await adapter.getCharge(CREDS, PAYMENT.id)
    expect(getMock).toHaveBeenCalledWith(`/v1/payments/${PAYMENT.id}`)
    expect(ChargeSchema.parse(c).id).toBe(PAYMENT.id)
  })

  it('getPayout reads GET /v1/payouts/{payout_id}', async () => {
    getMock.mockResolvedValue(PAYOUT)
    const p = await adapter.getPayout(CREDS, PAYOUT.id)
    expect(getMock).toHaveBeenCalledWith(`/v1/payouts/${PAYOUT.id}`)
    expect(PayoutSchema.parse(p).id).toBe(PAYOUT.id)
  })

  describe('customers (no Yoco endpoint)', () => {
    it.each(['listCustomers', 'getCustomer'] as const)(
      '%s throws 501 NOT_SUPPORTED and sends nothing',
      async (m) => {
        const call = m === 'listCustomers' ? adapter.listCustomers() : adapter.getCustomer()
        await expect(call).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
        expect(getMock).not.toHaveBeenCalled()
        expect(postMock).not.toHaveBeenCalled()
      },
    )
  })

  describe('listBalanceTransactions (payout entries over every payout)', () => {
    /** Payouts 0..n-1; payout i has entries[i] entries. */
    function install(entriesPer: number[]) {
      const pos = entriesPer.map((_, i) => ({ ...PAYOUT, id: `po-${i}` }))
      const entries = new Map(
        pos.map((p, i) => [
          p.id,
          Array.from({ length: entriesPer[i]! }, (_, j) => ({
            ...PAYOUT_ENTRY,
            id: `${p.id}-e${j}`,
            payout_id: p.id,
          })),
        ]),
      )
      getMock.mockImplementation(async (path: string, q: Record<string, unknown>) => {
        if (path === '/v1/payouts/') return cursorList(pos, q)
        const m = /^\/v1\/payouts\/([^/]+)\/payout_entries$/.exec(path)
        if (m) return cursorList(entries.get(m[1]!) ?? [], q)
        throw new Error(`unexpected path ${path}`)
      })
      return [...entries.values()].flat().map((e) => e.id)
    }

    it('walks 2L+1 entries across uneven payouts, every id once, hasMore exact', async () => {
      const L = 3
      // 7 entries: payouts of 0, 2, 4 and 1 entries, all on one page of payouts (fetched at
      // limit 100); the 101-payout test below covers more than one page of payouts.
      const all = install([0, 2, 4, 1])
      expect(all).toHaveLength(2 * L + 1)
      const { ids, hasMore } = await walk((p) => adapter.listBalanceTransactions(CREDS, p), L)
      expect(ids).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
    })

    it("follows next_cursor on the payouts list and on each payout's entries", async () => {
      // 101 payouts (two pages of payouts at 100); payout 0 has 101 entries (two pages of entries).
      const per = Array.from({ length: 101 }, (_, i) => (i === 0 ? 101 : i === 100 ? 1 : 0))
      const all = install(per)
      const { ids } = await walk((p) => adapter.listBalanceTransactions(CREDS, p), 50)
      expect(ids).toEqual(all)
      const paths = getMock.mock.calls.map((c) => [c[0], c[1]])
      expect(paths).toContainEqual([
        '/v1/payouts/',
        { limit: 100, cursor: Buffer.from('100').toString('base64') },
      ])
      expect(paths).toContainEqual([
        '/v1/payouts/po-0/payout_entries',
        { limit: 100, cursor: Buffer.from('100').toString('base64') },
      ])
    })

    it('parses rows with the canonical schema', async () => {
      install([2])
      const rows = await adapter.listBalanceTransactions(CREDS, { limit: 10 })
      expect(rows).toHaveLength(2)
      for (const r of rows) expect(() => BalanceTransactionSchema.parse(r)).not.toThrow()
    })

    it('an empty payouts page with a next_cursor continues onto the next payouts page', async () => {
      getMock.mockImplementation(async (path: string, q: Record<string, unknown>) => {
        for (const k of Object.keys(q))
          if (!LIST_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
        if (path === '/v1/payouts/')
          return q.cursor === 'c2'
            ? { data: [{ ...PAYOUT, id: 'po-late' }], next_cursor: null }
            : { data: [], next_cursor: 'c2' }
        if (path === '/v1/payouts/po-late/payout_entries')
          return {
            data: [{ ...PAYOUT_ENTRY, id: 'late-e0', payout_id: 'po-late' }],
            next_cursor: null,
          }
        throw new Error(`unexpected path ${path}`)
      })
      const { ids, hasMore } = await walk((p) => adapter.listBalanceTransactions(CREDS, p), 5)
      expect(ids).toEqual(['late-e0'])
      expect(hasMore).toEqual([false])
    })

    it('an account with no payouts is an empty, complete list', async () => {
      install([])
      const params = withPageSink({ page: 1, limit: 5 })
      expect(await adapter.listBalanceTransactions(CREDS, params)).toEqual([])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })
  })

  it('exchangeCredentials needs the API key and sends it as the bearer token', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: 'k1' })).resolves.toEqual({
      accessToken: 'k1',
    })
    await expect(adapter.exchangeCredentials({})).rejects.toThrow(/API key/)
    await expect(adapter.exchangeCredentials({ apiKey: '   ' })).rejects.toThrow(/API key/)
    await expect(adapter.exchangeCredentials({ apiKey: '  k2\n' })).resolves.toEqual({
      accessToken: 'k2',
    })
  })
})
