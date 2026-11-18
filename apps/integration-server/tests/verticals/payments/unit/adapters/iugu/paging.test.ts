/**
 * Iugu list methods, paged the way the router and the sync worker ask.
 *
 * Iugu's listing APIs page by offset (https://dev.iugu.com/reference/pagina%C3%A7%C3%A3o):
 * "Em nossas APIs de listagem, usamos dois parâmetros que possibilitam a
 * paginação em sua aplicação." — `start` ("Quantos registros pular do início
 * da pesquisa") and `limit` ("Limita o número de registros retornados em até
 * 100"). The end is a short page: "Para detectar o fim da listagem, compare
 * items.length com limit : se for menor, não há mais páginas."
 * (https://dev.iugu.com/reference/listar-cliente).
 *
 * The adapter used to send `{ limit }` alone, so page 2 was page 1 again, and
 * listCustomers / listDisputes read an envelope key (`data`, `results`) the
 * documented `{ items }` response does not carry, so they returned nothing.
 *
 * The fake below honours only `start` and `limit`, refuses a limit outside the
 * documented range, and — for /customers and /subscriptions — answers the
 * documented 400 for `start > 100` without a filter (2026-06-11 changelog).
 *
 * listPayouts reads GET /v1/withdraw_requests ("Retorna a lista de todas as
 * transferências bancárias.", https://dev.iugu.com/reference/listar-transferencia-bancaria),
 * not GET /v1/transfers, which is iugu-to-iugu transfers shaped { sent, received }.
 *
 * listCharges, getCharge and listRefunds refuse with 501 before any request:
 * iugu documents no GET for charges (only POST /v1/charge) and no refund list
 * (a refund is POST /v1/invoices/{id}/refund).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { IuguAdapter } from '../../../../../../src/verticals/payments/adapters/iugu'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/payments/adapters/iugu/constants'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/iugu/client', () => ({
  IuguClient: class {
    get = getMock
    post = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new IuguAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'aXVndV90ZXN0Og==' }
const IUGU_MAX = 100
const DOCUMENTED = new Set(['start', 'limit'])

type ListMethod =
  | 'listCustomers'
  | 'listInvoices'
  | 'listSubscriptions'
  | 'listPlans'
  | 'listDisputes'
  | 'listPayouts'

interface Endpoint {
  path: string
  /** The documented ceiling on `limit` for this endpoint. */
  max: number
  /** `start > 100` without a filter is a 400 here (2026-06-11 changelog). */
  deepPageLimited: boolean
}

const METHODS: [ListMethod, Endpoint][] = [
  ['listCustomers', { path: '/customers', max: 100, deepPageLimited: true }],
  ['listInvoices', { path: '/invoices', max: 100, deepPageLimited: false }],
  ['listSubscriptions', { path: '/subscriptions', max: 100, deepPageLimited: true }],
  ['listPlans', { path: '/plans', max: 1000, deepPageLimited: false }],
  // No per-endpoint maximum is documented; the site-wide page names 100.
  ['listDisputes', { path: '/chargebacks', max: 100, deepPageLimited: false }],
  // No per-endpoint maximum is documented; the site-wide page names 100.
  ['listPayouts', { path: '/withdraw_requests', max: 100, deepPageLimited: false }],
]

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row_${i + 1}`)
}

class FakeHttpError extends Error {
  response: { status: number; data: unknown }
  constructor(status: number, data: unknown) {
    super(`Request failed with status code ${status}`)
    this.response = { status, data }
  }
}

/** Serve `n` rows at `ep.path`, honouring only `start` and `limit`. */
function serve(ep: Endpoint, n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== ep.path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    const limit = params['limit'] === undefined ? 100 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > ep.max) {
      throw new FakeHttpError(400, { errors: `invalid limit ${String(params['limit'])}` })
    }
    const start = params['start'] === undefined ? 0 : Number(params['start'])
    if (!Number.isInteger(start) || start < 0) throw new FakeHttpError(400, { errors: 'start' })
    if (ep.deepPageLimited && start > 100) {
      throw new FakeHttpError(400, {
        errors: 'Paginação profunda (start > 100) requer ao menos um filtro',
      })
    }
    const items = ids
      .slice(start, start + limit)
      .map((id) =>
        ep.path === '/withdraw_requests'
          ? { id, status: 'accepted', amount: 'R$ 5,00' }
          : { id, email: `${id}@x.test` },
      )
    if (ep.path === '/chargebacks') return { facets: {}, items }
    if (ep.path === '/withdraw_requests') return { items, totalItems: ids.length }
    if (ep.path === '/invoices') return { items, totalItems: ids.length }
    if (ep.path === '/plans') return { items }
    // customers / subscriptions: since 2026-06-11 totalItems is the page's size.
    return { items, totalItems: items.length }
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

describe.each(METHODS)('IuguAdapter.%s paging', (method, ep) => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(ep, 2 * L + 1)
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
    expect(calls[1]).toEqual({ limit: L, start: L })
    for (const c of calls) for (const k of Object.keys(c)) expect(DOCUMENTED.has(k), k).toBe(true)
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    // start stays <= 100, the deep-paging ceiling on /customers and /subscriptions.
    const N = IUGU_MAX + 50
    const calls = serve(ep, N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(IUGU_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, false])
    expect(calls).toEqual([
      { limit: IUGU_MAX, start: 0 },
      { limit: IUGU_MAX, start: IUGU_MAX },
    ])
  })

  it('ends on an empty page when rows end on a page boundary', async () => {
    const L = 10
    serve(ep, 2 * L)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L))
    expect(hasMore).toEqual([true, true, false])
  })

  it('ends on a page one row short of full (2L-1 rows)', async () => {
    const L = 10
    serve(ep, 2 * L - 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L - 1))
    expect(hasMore).toEqual([true, false])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(ep, L + 3)
    const metas = []
    const ids: string[] = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      metas.push(listPage(rows, params, 'iugu').meta)
    }
    expect(ids).toEqual(rowIds(L + 3))
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
  })
})

describe.each(METHODS.filter(([, ep]) => ep.deepPageLimited))(
  'IuguAdapter.%s deep paging',
  (method, ep) => {
    it('surfaces the documented 400 past start=100 instead of serving an empty page', async () => {
      serve(ep, 500)
      await expect(call(method, withPageSink({ page: 3, limit: 100 }))).rejects.toMatchObject({
        response: { status: 400 },
      })
    })
  },
)

describe('IuguAdapter page size guards (direct calls, outside the router)', () => {
  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, DEFAULT_PAGE_SIZE],
    ['an infinite limit', Number.POSITIVE_INFINITY, IUGU_MAX],
  ])('sends a valid limit for %s', async (_label, limit, sent) => {
    const calls = serve(METHODS[1]![1], 5)
    const params = withPageSink({ page: 1, limit })
    const rows = await call('listInvoices', params)
    expect(calls).toEqual([{ limit: sent, start: 0 }])
    expect(rows).toHaveLength(Math.min(sent, 5))
  })

  it.each([
    ['page 0', 0],
    ['a negative page', -1],
  ])('sends start 0 for %s', async (_label, page) => {
    const calls = serve(METHODS[1]![1], 5)
    await call('listInvoices', withPageSink({ page, limit: 2 }))
    expect(calls).toEqual([{ limit: 2, start: 0 }])
  })

  it('falls back to DEFAULT_PAGE_SIZE when no limit is given', async () => {
    const calls = serve(METHODS[1]![1], 3)
    await call('listInvoices', { page: 2 } as QueryParams)
    expect(calls).toEqual([{ limit: DEFAULT_PAGE_SIZE, start: DEFAULT_PAGE_SIZE }])
  })
})

describe('IuguAdapter.getPayout', () => {
  it('reads GET /withdraw_requests/{id} as a bare object', async () => {
    getMock.mockImplementation(async (p: string) => {
      if (p !== '/withdraw_requests/530706A3862D4BB49C8AC9637B850CDE') {
        throw new Error(`unexpected path ${p}`)
      }
      return {
        id: '530706A3862D4BB49C8AC9637B850CDE',
        status: 'pending',
        created_at: '2015-11-26T10:02:23-02:00',
        updated_at: '2015-11-26T10:02:23-02:00',
        reference: null,
        amount: 'R$ 10,00',
        feedback: null,
      }
    })
    const payout = await adapter.getPayout(CREDS, '530706A3862D4BB49C8AC9637B850CDE')
    expect(payout).toMatchObject({
      id: '530706A3862D4BB49C8AC9637B850CDE',
      amount: 1000,
      currency: 'BRL',
    })
  })
})

describe('IuguAdapter.getPayout id encoding', () => {
  it('percent-encodes an id with reserved characters into one path segment', async () => {
    getMock.mockImplementation(async (p: string) => {
      if (p !== '/withdraw_requests/a%2Fb%3Fc') throw new Error(`unexpected path ${p}`)
      return { id: 'a/b?c', status: 'pending', amount: 'R$ 5,00' }
    })
    const payout = await adapter.getPayout(CREDS, 'a/b?c')
    expect(payout.id).toBe('a/b?c')
  })
})

describe('IuguAdapter methods with no documented endpoint', () => {
  it.each([
    ['listCharges', () => adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['getCharge', () => adapter.getCharge(CREDS, 'ch_1')],
    ['listRefunds', () => adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 10 }))],
  ])('%s refuses with 501 NOT_SUPPORTED and sends no request', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })
})
