/**
 * Asaas list methods, paged the way the router and the sync worker ask.
 *
 * Every Asaas v3 list endpoint pages by offset
 * (https://docs.asaas.com/reference/listing-and-pagination): "The `limit`
 * must be a numeric value between 1 and 100. If omitted, the default value
 * used is 10." and "The attribute `hasMore` in the request response indicates
 * whether there is another page to be fetched for the given filters." The
 * envelope is `{ object, hasMore, totalCount, limit, offset, data }`.
 *
 * The shared page params used to send `{ limit }` alone, so page 2 was page 1
 * again on all seven list methods. The fake below honours only `offset` and
 * `limit`, and refuses a limit outside 1..100.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { AsaasAdapter } from '../../../../../../src/verticals/payments/adapters/asaas'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/payments/adapters/asaas/constants'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/asaas/client', () => ({
  AsaasClient: class {
    get = getMock
    post = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new AsaasAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: '$aact_prod_paging' }
const ASAAS_MAX = 100
const ASAAS_DEFAULT = 10
const DOCUMENTED = new Set(['offset', 'limit'])

type ListMethod =
  | 'listCustomers'
  | 'listCharges'
  | 'listSubscriptions'
  | 'listInvoices'
  | 'listPayouts'
  | 'listDisputes'
  | 'listBalanceTransactions'

const METHODS: [ListMethod, string][] = [
  ['listCustomers', '/customers'],
  ['listCharges', '/payments'],
  ['listSubscriptions', '/subscriptions'],
  ['listInvoices', '/invoices'],
  ['listPayouts', '/transfers'],
  ['listDisputes', '/chargebacks'],
  ['listBalanceTransactions', '/financialTransactions'],
]

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row_${i + 1}`)
}

/** Serve `n` rows at `path`, honouring only `offset` and `limit`. */
function serve(path: string, n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    const limit = params['limit'] === undefined ? ASAAS_DEFAULT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > ASAAS_MAX) {
      throw new Error(`invalid_limit: ${String(params['limit'])}`)
    }
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid_offset')
    const data = ids.slice(offset, offset + limit).map((id) => ({ id, value: 10 }))
    return {
      object: 'list',
      hasMore: offset + limit < ids.length,
      totalCount: ids.length,
      limit,
      offset,
      data,
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

describe.each(METHODS)('AsaasAdapter.%s paging', (method, path) => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(path, 2 * L + 1)
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

  it('clamps a limit above 100 and still serves every row', async () => {
    const N = 2 * ASAAS_MAX + 1
    const calls = serve(path, N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(ASAAS_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['limit'])).toEqual([ASAAS_MAX, ASAAS_MAX, ASAAS_MAX])
    expect(calls.map((c) => c['offset'])).toEqual([0, ASAAS_MAX, 2 * ASAAS_MAX])
  })

  it('reports the envelope hasMore, not a full-page guess, when rows end on a page boundary', async () => {
    const L = 10
    serve(path, 2 * L)
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
    serve(path, 2 * L)
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call(method, params)
      metas.push(listPage(rows, params, 'asaas').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L, 2 * L])
  })

  it('API path clamps a limit above the declared maximum', async () => {
    const calls = serve(path, ASAAS_MAX + 5)
    const params = parseListQuery({ page: '2', limit: '250' }, routed)
    // The declared maximum reaches the router, so the caller page is 100 too.
    expect(params.limit).toBe(ASAAS_MAX)
    const rows = await call(method, params)
    expect(rows.map((r) => r.id)).toEqual(rowIds(ASAAS_MAX + 5).slice(ASAAS_MAX))
    expect(calls).toEqual([{ limit: ASAAS_MAX, offset: ASAAS_MAX }])
    expect(listPage(rows, params, 'asaas').meta.hasMore).toBe(false)
  })
})

describe('AsaasAdapter page size guards (direct calls, outside the router)', () => {
  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, 1],
    ['an infinite limit', Number.POSITIVE_INFINITY, 1],
  ])('sends a valid limit for %s', async (_label, limit, sent) => {
    const calls = serve('/customers', 5)
    const params = withPageSink({ page: 1, limit })
    const rows = await call('listCustomers', params)
    expect(calls).toEqual([{ limit: sent, offset: 0 }])
    expect(rows).toHaveLength(sent)
    expect(readUpstreamPage(params)?.pageSize).toBe(sent)
  })

  it('falls back to DEFAULT_PAGE_SIZE when no limit is given', async () => {
    const calls = serve('/customers', 3)
    await call('listCustomers', { page: 2 } as QueryParams)
    expect(calls).toEqual([{ limit: DEFAULT_PAGE_SIZE, offset: DEFAULT_PAGE_SIZE }])
  })
})
