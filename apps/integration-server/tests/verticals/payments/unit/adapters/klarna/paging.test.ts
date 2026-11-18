/**
 * Klarna listPayouts, paged the way the router and the sync worker ask.
 *
 * GET /settlements/v1/payouts pages by offset
 * (https://docs.klarna.com/acquirer/klarna/api/settlements/): `size` is "How
 * many elements to include in the result. If no value for size is provided,
 * a default of 20 will be used. A maximum of 500 can be set", and `offset` is
 * "The current offset. Describes \"where\" in a collection the current
 * starts." The response is `{ payouts, pagination: { count, total, next,
 * prev, offset } }`, with `total` "The total amount of elements that are
 * available" and `next` "The URI to the next \"page\" of results.".
 *
 * The adapter used to send no query at all, so every caller page was
 * Klarna's default first 20 payouts. The fake below honours only `size` and
 * `offset`, and refuses a size outside 1..500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { KlarnaAdapter } from '../../../../../../src/verticals/payments/adapters/klarna'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/klarna/client', () => ({
  KlarnaClient: class {
    get = getMock
    post = vi.fn()
  },
}))

const adapter = new KlarnaAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'dXNlcjpwYXNz', extra: { region: 'eu_live' } }
const PATH = '/settlements/v1/payouts'
const KLARNA_MAX = 500
const KLARNA_DEFAULT = 20
const DOCUMENTED = new Set(['size', 'offset'])

function refs(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `PAY-${i + 1}`)
}

/**
 * Serve `n` payouts, honouring only `size` and `offset`. `withTotal: false`
 * drops `pagination.total` (only `count` is required by the spec), leaving
 * `next` as the only end signal.
 */
function serve(n: number, opts: { withTotal?: boolean } = {}) {
  const withTotal = opts.withTotal ?? true
  const calls: Record<string, unknown>[] = []
  const ids = refs(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== PATH) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    const size = params['size'] === undefined ? KLARNA_DEFAULT : Number(params['size'])
    if (!Number.isInteger(size) || size < 1 || size > KLARNA_MAX) {
      throw new Error(`invalid size: ${String(params['size'])}`)
    }
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid offset')
    const payouts = ids
      .slice(offset, offset + size)
      .map((ref) => ({ payment_reference: ref, payout_date: '2026-01-01T00:00:00Z' }))
    const more = offset + size < ids.length
    return {
      payouts,
      pagination: {
        count: payouts.length,
        ...(withTotal ? { total: ids.length } : {}),
        offset,
        ...(more
          ? { next: `https://api.klarna.com${PATH}?offset=${offset + size}&size=${size}` }
          : {}),
      },
    }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
})

describe('KlarnaAdapter.listPayouts paging', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listPayouts(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(refs(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[1]).toEqual({ size: L, offset: L })
    for (const c of calls) for (const k of Object.keys(c)) expect(DOCUMENTED.has(k), k).toBe(true)
  })

  it('ends on pagination.next when pagination.total is absent', async () => {
    const L = 10
    serve(2 * L, { withTotal: false })
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await adapter.listPayouts(CREDS, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('ends on pagination.total even when pagination.next is still set', async () => {
    // The spec says only that `next` is "The URI to the next \"page\" of
    // results."; it never promises `next` is absent on the last page.
    const L = 10
    serve(2 * L)
    const inner = getMock.getMockImplementation()!
    getMock.mockImplementation(async (p: string, params: Record<string, unknown>) => {
      const res = (await inner(p, params)) as { pagination: Record<string, unknown> }
      res.pagination['next'] = `https://api.klarna.com${PATH}?offset=999`
      return res
    })
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await adapter.listPayouts(CREDS, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('keeps paging after a short page while total says rows remain', async () => {
    // hasMore must count the rows Klarna returned, not the size asked for.
    const L = 10
    serve(2 * L)
    const inner = getMock.getMockImplementation()!
    getMock.mockImplementation(async (p: string, params: Record<string, unknown>) => {
      const res = (await inner(p, params)) as { payouts: unknown[] }
      res.payouts = res.payouts.slice(0, L - 3)
      return res
    })
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listPayouts(CREDS, params)
    expect(rows).toHaveLength(L - 3)
    // offset 10 + 7 rows = 17 < total 20: more remain; offset + size would say 20.
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('ends on an empty page even when total says rows remain', async () => {
    const L = 10
    serve(2 * L)
    const inner = getMock.getMockImplementation()!
    getMock.mockImplementation(async (p: string, params: Record<string, unknown>) => {
      const res = (await inner(p, params)) as { payouts: unknown[] }
      res.payouts = []
      return res
    })
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listPayouts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('declares the documented maximum of 500', () => {
    expect(adapter.capabilities.maxPageSize).toBe(KLARNA_MAX)
  })

  it('clamps a limit above 500 and still serves every row', async () => {
    const N = 2 * KLARNA_MAX + 1
    const calls = serve(N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 1000 })
      const rows = await adapter.listPayouts(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(KLARNA_MAX)
    }
    expect(ids).toEqual(refs(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['size'])).toEqual([KLARNA_MAX, KLARNA_MAX, KLARNA_MAX])
    expect(calls.map((c) => c['offset'])).toEqual([0, KLARNA_MAX, 2 * KLARNA_MAX])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(2 * L)
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listPayouts(CREDS, params)
      metas.push(listPage(rows, params, 'klarna').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L, 2 * L])
  })

  it('API path clamps a limit above the declared maximum', async () => {
    const calls = serve(KLARNA_MAX + 5)
    const params = parseListQuery({ page: '2', limit: '900' }, routed)
    expect(params.limit).toBe(KLARNA_MAX)
    const rows = await adapter.listPayouts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(refs(KLARNA_MAX + 5).slice(KLARNA_MAX))
    expect(calls).toEqual([{ size: KLARNA_MAX, offset: KLARNA_MAX }])
    expect(listPage(rows, params, 'klarna').meta.hasMore).toBe(false)
  })

  it('sends the documented default size when no limit is given', async () => {
    const calls = serve(3)
    await adapter.listPayouts(CREDS, { page: 2 } as QueryParams)
    expect(calls).toEqual([{ size: KLARNA_DEFAULT, offset: KLARNA_DEFAULT }])
  })

  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, 1],
  ])('sends a valid size for %s', async (_label, limit, sent) => {
    const calls = serve(5)
    const params = withPageSink({ page: 1, limit })
    const rows = await adapter.listPayouts(CREDS, params)
    expect(calls).toEqual([{ size: sent, offset: 0 }])
    expect(rows).toHaveLength(sent)
  })
})
