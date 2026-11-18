/**
 * Mercado Pago search endpoints, paged the way the router and the sync worker
 * ask.
 *
 * All four search endpoints page by offset and answer with
 * `{ paging: { total, limit, offset }, results }`:
 *
 *   - GET /v1/payments/search: "Position from which you want the results to be
 *     returned. By default, the value is 0 (max. allowed: 10000)." and limit
 *     "Number of results shown (max value = 50)."
 *     (https://www.mercadopago.com.br/developers/en/docs/subscriptions/additional-content/payment-management)
 *   - GET /preapproval/search, /preapproval_plan/search,
 *     /authorized_payments/search: "Specifies the offset of the first item in
 *     the collection to return." with `limit` and no documented maximum
 *     (https://www.mercadopago.com.br/developers/en/reference/online-payments/subscriptions/).
 *
 * The adapter used to send `{ limit }` (charges, invoices) or nothing at all
 * (subscriptions, plans), so page 2 was page 1 again. The fake below honours
 * only `offset` and `limit`, and refuses a payments limit above 50 the way the
 * platform does (error 1000 "Number of rows exceeded the limits.").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { MercadoPagoAdapter } from '../../../../../../src/verticals/payments/adapters/mercado-pago'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/payments/adapters/mercado-pago/constants'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/mercado-pago/client', () => ({
  MercadoPagoClient: class {
    get = getMock
    post = vi.fn()
  },
}))

const adapter = new MercadoPagoAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'APP_USR-paging' }
const PAYMENTS_MAX = 50
/** Mercado Pago's own default when `limit` is not sent (payments guide). */
const UPSTREAM_DEFAULT = 30
const DOCUMENTED = new Set(['offset', 'limit'])

type ListMethod = 'listCharges' | 'listSubscriptions' | 'listPlans' | 'listInvoices'

const METHODS: [ListMethod, string, number | undefined][] = [
  ['listCharges', '/v1/payments/search', PAYMENTS_MAX],
  ['listSubscriptions', '/preapproval/search', undefined],
  ['listPlans', '/preapproval_plan/search', undefined],
  ['listInvoices', '/authorized_payments/search', undefined],
]

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(1000 + i + 1))
}

/** Serve `n` rows at `path`, honouring only `offset` and `limit`. */
function serve(path: string, n: number, max?: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    const limit = params['limit'] === undefined ? UPSTREAM_DEFAULT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || (max !== undefined && limit > max)) {
      throw new Error('1000: Number of rows exceeded the limits.')
    }
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('invalid_offset')
    return {
      paging: { total: ids.length, limit, offset },
      results: ids.slice(offset, offset + limit).map((id) => ({ id: Number(id) })),
    }
  })
  return calls
}

async function call(method: ListMethod, params: QueryParams): Promise<{ id: string }[]> {
  const fn = adapter[method].bind(adapter) as (
    c: Credentials,
    p: QueryParams,
  ) => Promise<{ id: string }[]>
  return fn(CREDS, params)
}

beforeEach(() => {
  getMock.mockReset()
})

describe.each(METHODS)('MercadoPagoAdapter.%s paging', (method, path, max) => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(path, 2 * L + 1, max)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[1]).toEqual({ limit: L, offset: L })
    for (const c of calls) for (const k of Object.keys(c)) expect(DOCUMENTED.has(k), k).toBe(true)
  })

  it('reports the end exactly when rows end on a page boundary', async () => {
    const L = 10
    serve(path, 2 * L, max)
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await call(method, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(path, 2 * L + 1, max)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call(method, params)
      metas.push(listPage(rows, params, 'mercado-pago').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })
})

describe('MercadoPagoAdapter.listCharges page size ceiling', () => {
  it('clamps a limit above 50 and still serves every row', async () => {
    const N = 2 * PAYMENTS_MAX + 1
    const calls = serve('/v1/payments/search', N, PAYMENTS_MAX)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call('listCharges', params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(PAYMENTS_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['limit'])).toEqual([PAYMENTS_MAX, PAYMENTS_MAX, PAYMENTS_MAX])
    expect(calls.map((c) => c['offset'])).toEqual([0, PAYMENTS_MAX, 2 * PAYMENTS_MAX])
  })

  it('API path: a limit above 50 is served at 50 with an exact meta', async () => {
    const calls = serve('/v1/payments/search', PAYMENTS_MAX + 5, PAYMENTS_MAX)
    const p1 = parseListQuery({ page: '1', limit: '200' }, routed)
    const r1 = await call('listCharges', p1)
    const m1 = listPage(r1, p1, 'mercado-pago').meta
    expect(r1.map((r) => r.id)).toEqual(rowIds(PAYMENTS_MAX + 5).slice(0, PAYMENTS_MAX))
    expect(m1.limit).toBe(PAYMENTS_MAX)
    expect(m1.hasMore).toBe(true)
    const p2 = parseListQuery({ page: '2', limit: '200' }, routed)
    const r2 = await call('listCharges', p2)
    expect(r2.map((r) => r.id)).toEqual(rowIds(PAYMENTS_MAX + 5).slice(PAYMENTS_MAX))
    expect(listPage(r2, p2, 'mercado-pago').meta.hasMore).toBe(false)
    expect(calls.map((c) => c['offset'])).toEqual([0, PAYMENTS_MAX])
  })
})

describe.each(METHODS.filter(([, , max]) => max === undefined))(
  'MercadoPagoAdapter.%s with no documented maximum',
  (method, path) => {
    it('sends the caller limit as is', async () => {
      const calls = serve(path, 450)
      const params = withPageSink({ page: 2, limit: 200 })
      const rows = await call(method, params)
      expect(calls).toEqual([{ limit: 200, offset: 200 }])
      expect(rows).toHaveLength(200)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })
  },
)

describe('MercadoPagoAdapter page size guards (direct calls, outside the router)', () => {
  it.each([
    ['a limit of 0', 0, DEFAULT_PAGE_SIZE],
    ['a negative limit', -5, DEFAULT_PAGE_SIZE],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, DEFAULT_PAGE_SIZE],
    ['an infinite limit', Number.POSITIVE_INFINITY, DEFAULT_PAGE_SIZE],
  ])('sends a valid limit for %s', async (_label, limit, sent) => {
    const calls = serve('/v1/payments/search', 120, PAYMENTS_MAX)
    const params = withPageSink({ page: 1, limit })
    const rows = await call('listCharges', params)
    expect(calls).toEqual([{ limit: sent, offset: 0 }])
    expect(rows).toHaveLength(sent)
  })

  it('falls back to DEFAULT_PAGE_SIZE when no limit is given', async () => {
    const calls = serve('/preapproval/search', 3)
    await call('listSubscriptions', { page: 2 } as QueryParams)
    expect(calls).toEqual([{ limit: DEFAULT_PAGE_SIZE, offset: DEFAULT_PAGE_SIZE }])
  })
})

describe('MercadoPagoAdapter guards on the upstream answer', () => {
  it('sends limit 1 for a limit between 0 and 1, never 0', async () => {
    const calls = serve('/v1/payments/search', 120, PAYMENTS_MAX)
    const params = withPageSink({ page: 1, limit: 0.5 })
    const rows = await call('listCharges', params)
    expect(calls).toEqual([{ limit: DEFAULT_PAGE_SIZE, offset: 0 }])
    expect(rows).toHaveLength(DEFAULT_PAGE_SIZE)
  })

  it.each(METHODS)(
    '%s: an answer without paging.total reports no end and no count',
    async (method, path) => {
      getMock.mockImplementation(async (p: string) => {
        if (p !== path) throw new Error(`unexpected path ${p}`)
        return { paging: { limit: 10, offset: 0 }, results: [{ id: 1 }] }
      })
      const params = withPageSink({ page: 1, limit: 10 })
      await call(method, params)
      const report = readUpstreamPage(params)
      expect(report?.pageSize).toBe(10)
      expect(report?.hasMore).toBeUndefined()
      expect(report?.totalCount).toBeUndefined()
    },
  )
})

describe('MercadoPagoAdapter.listCharges offset ceiling (max. allowed: 10000)', () => {
  const MAX_OFFSET = 10000
  const TOTAL = MAX_OFFSET + 5 * PAYMENTS_MAX

  it('announces the page that starts at offset 10000', async () => {
    const calls = serve('/v1/payments/search', TOTAL, PAYMENTS_MAX)
    const params = withPageSink({ page: MAX_OFFSET / PAYMENTS_MAX, limit: PAYMENTS_MAX })
    await call('listCharges', params)
    expect(calls).toEqual([{ limit: PAYMENTS_MAX, offset: MAX_OFFSET - PAYMENTS_MAX }])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports the reachable end at offset 10000 rather than a page the platform refuses', async () => {
    const calls = serve('/v1/payments/search', TOTAL, PAYMENTS_MAX)
    const params = withPageSink({ page: MAX_OFFSET / PAYMENTS_MAX + 1, limit: PAYMENTS_MAX })
    const rows = await call('listCharges', params)
    expect(calls).toEqual([{ limit: PAYMENTS_MAX, offset: MAX_OFFSET }])
    expect(rows).toHaveLength(PAYMENTS_MAX)
    const report = readUpstreamPage(params)
    expect(report?.hasMore).toBe(false)
    expect(report?.totalCount).toBe(TOTAL)
  })

  it('does not cap the subscription search, which documents no offset maximum', async () => {
    serve('/preapproval/search', TOTAL)
    const params = withPageSink({ page: MAX_OFFSET / PAYMENTS_MAX + 1, limit: PAYMENTS_MAX })
    await call('listSubscriptions', params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
