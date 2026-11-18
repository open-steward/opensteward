/**
 * Opn Payments (Omise) list methods, paged the way the router and the sync worker ask.
 *
 * Every Omise list endpoint pages by offset (https://docs.omise.co/api-pagination,
 * "The same applies to all list APIs (cards, transactions)."): `limit` is
 * "(optional, default: 20, maximum: 100)", and `offset` is "Offset of the first
 * record returned (i.e. how many records to skip from the beginning)." The list
 * object echoes `offset` and `limit` and carries `total`, "Total amount of
 * records between from and to".
 *
 * The adapter used to send `{ limit }` alone, so page 2 was page 1 again on every
 * list method. The fake below honours only `offset` and `limit`, and refuses a
 * limit outside 1..100.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { OpnPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/opn-payments'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/payments/adapters/opn-payments/constants'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/opn-payments/client', () => ({
  OpnPaymentsClient: class {
    get = getMock
    post = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new OpnPaymentsAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'c2tleV90ZXN0X3BhZ2luZzo=' }
const OMISE_MAX = 100
const OMISE_DEFAULT = 20
const DOCUMENTED = new Set(['offset', 'limit'])
const CUSTOMER = 'cust_test_paging'

type ListMethod =
  | 'listCustomers'
  | 'listCharges'
  | 'listRefunds'
  | 'listPaymentMethods'
  | 'listSubscriptions'
  | 'listPayouts'
  | 'listDisputes'
  | 'listBalanceTransactions'

const METHODS: [ListMethod, string][] = [
  ['listCustomers', '/customers'],
  ['listCharges', '/charges'],
  ['listRefunds', '/refunds'],
  ['listPaymentMethods', `/customers/${CUSTOMER}/cards`],
  ['listSubscriptions', '/schedules'],
  ['listPayouts', '/transfers'],
  ['listDisputes', '/disputes'],
  ['listBalanceTransactions', '/transactions'],
]

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row_${i + 1}`)
}

/** Serve `n` rows at `path` as an Omise list object, honouring only `offset` and `limit`. */
function serve(path: string, n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    const limit = params['limit'] === undefined ? OMISE_DEFAULT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > OMISE_MAX) {
      throw new Error(`invalid_limit: ${String(params['limit'])}`)
    }
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid_offset')
    const data = ids.slice(offset, offset + limit).map((id) => ({ id, amount: 1000 }))
    return {
      object: 'list',
      from: '1970-01-01T00:00:00Z',
      to: '2026-09-23T00:00:00Z',
      order: 'chronological',
      offset,
      limit,
      total: ids.length,
      data,
    }
  })
  return calls
}

function withScope(method: ListMethod, params: QueryParams): QueryParams {
  if (method === 'listPaymentMethods') (params as Record<string, unknown>)['customerId'] = CUSTOMER
  return params
}

async function call(method: ListMethod, params: QueryParams): Promise<{ id: string }[]> {
  const fn = adapter[method].bind(adapter) as (
    c: Credentials,
    p: QueryParams,
  ) => Promise<{ id: string }[]>
  return fn(CREDS, withScope(method, params))
}

beforeEach(() => {
  getMock.mockReset()
})

describe('OpnPaymentsAdapter capabilities', () => {
  it('declares the documented maximum of 100', () => {
    expect(adapter.capabilities.maxPageSize).toBe(OMISE_MAX)
  })
})

describe.each(METHODS)('OpnPaymentsAdapter.%s paging', (method, path) => {
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
    const N = 2 * OMISE_MAX + 1
    const calls = serve(path, N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(OMISE_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['limit'])).toEqual([OMISE_MAX, OMISE_MAX, OMISE_MAX])
    expect(calls.map((c) => c['offset'])).toEqual([0, OMISE_MAX, 2 * OMISE_MAX])
  })

  it('reports the envelope total, not a full-page guess, when rows end on a page boundary', async () => {
    const L = 10
    serve(path, 2 * L)
    const reports = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await call(method, params)
      reports.push(readUpstreamPage(params))
    }
    expect(reports.map((r) => r?.hasMore)).toEqual([true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([2 * L, 2 * L])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(path, 2 * L + 1)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call(method, params)
      metas.push(listPage(rows, params, 'opn-payments').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('API path clamps a limit above the declared maximum', async () => {
    const calls = serve(path, OMISE_MAX + 5)
    const params = parseListQuery({ page: '2', limit: '250' }, routed)
    expect(params.limit).toBe(OMISE_MAX)
    const rows = await call(method, params)
    expect(rows.map((r) => r.id)).toEqual(rowIds(OMISE_MAX + 5).slice(OMISE_MAX))
    expect(calls).toEqual([{ limit: OMISE_MAX, offset: OMISE_MAX }])
    expect(listPage(rows, params, 'opn-payments').meta.hasMore).toBe(false)
  })
})

describe('OpnPaymentsAdapter page size guards (direct calls, outside the router)', () => {
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

  it('leaves the end to the router when the envelope omits total', async () => {
    getMock.mockResolvedValue({ object: 'list', data: [{ id: 'a' }, { id: 'b' }] })
    const params = withPageSink({ page: 1, limit: 2 })
    const rows = await call('listCharges', params)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    const report = readUpstreamPage(params)
    expect(report?.pageSize).toBe(2)
    expect(report?.totalCount).toBeUndefined()
    // Neither a guessed end nor a guessed continuation: hasMore stays unreported.
    expect(report?.hasMore).toBeUndefined()
  })

  // A full page with no count is unknown (null) to the router; a short page ends the list.
  // A guessed hasMore from the adapter would override both.
  it('without total, the API path leaves a full page open and ends on a short one', async () => {
    const ids = rowIds(4)
    getMock.mockImplementation(async (_p: string, q: Record<string, unknown> = {}) => {
      const limit = Number(q['limit'])
      const offset = Number(q['offset'])
      return { object: 'list', data: ids.slice(offset, offset + limit).map((id) => ({ id })) }
    })
    const full = parseListQuery({ page: '1', limit: '2' }, routed)
    const fullRows = await call('listCharges', full)
    expect(fullRows.map((r) => r.id)).toEqual(['row_1', 'row_2'])
    expect(listPage(fullRows, full, 'opn-payments').meta.hasMore).toBeNull()

    const short = parseListQuery({ page: '2', limit: '3' }, routed)
    const shortRows = await call('listCharges', short)
    expect(shortRows.map((r) => r.id)).toEqual(['row_4'])
    expect(listPage(shortRows, short, 'opn-payments').meta.hasMore).toBe(false)
  })

  it('reports the end from the sent offset when the envelope omits offset', async () => {
    // Page 2 of size 2 with total 4 is the last page; counting from 0 would say hasMore.
    getMock.mockResolvedValue({ object: 'list', total: 4, data: [{ id: 'c' }, { id: 'd' }] })
    const params = withPageSink({ page: 2, limit: 2 })
    await call('listCharges', params)
    expect(getMock).toHaveBeenCalledWith('/charges', { limit: 2, offset: 2 })
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('listPaymentMethods without a customer sends nothing', async () => {
    const rows = await adapter.listPaymentMethods(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows).toEqual([])
    expect(getMock).not.toHaveBeenCalled()
  })
})
