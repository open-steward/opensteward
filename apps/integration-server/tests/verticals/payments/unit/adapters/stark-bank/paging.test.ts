/**
 * Stark Bank list methods, paged the way the router and the sync worker ask.
 *
 * https://docs.starkbank.com/api (Pagination): "List endpoints return at most
 * 100 objects per call, together with a cursor string. To fetch the next
 * batch, repeat the same request with the cursor in the query string
 * (?cursor=...), keeping every other filter unchanged. The cursor comes back
 * as null when there are no more results." Every list takes `limit`
 * ("Number of results per cursor. Max = 100.").
 *
 * The adapter used to request /v2/v2/<resource> with `{ limit }` alone and
 * read the wrong envelope key. The fake below honours only `cursor` and
 * `limit`, refuses a limit outside 1..100, and serves each resource under its
 * documented key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { StarkBankAdapter } from '../../../../../../src/verticals/payments/adapters/stark-bank'
import { DOC_INVOICE, DOC_SUBSCRIPTION, DOC_TRANSACTION, DOC_TRANSFER } from './fixtures/docs'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/stark-bank/client', () => ({
  StarkBankClient: class {
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params)
    post = (path: string, body?: unknown) => postMock(path, body)
  },
}))

const adapter = new StarkBankAdapter()
const CREDS: Credentials = { accessToken: 'pem-a', extra: { projectId: '5656565656565656' } }
const MAX = 100

type ListMethod = 'listInvoices' | 'listPayouts' | 'listBalanceTransactions' | 'listSubscriptions'

const METHODS: [ListMethod, string, string, Record<string, unknown>][] = [
  ['listInvoices', '/invoice', 'invoices', DOC_INVOICE],
  ['listPayouts', '/transfer', 'transfers', DOC_TRANSFER],
  ['listBalanceTransactions', '/transaction', 'transactions', DOC_TRANSACTION],
  ['listSubscriptions', '/invoice-pull-subscription', 'subscriptions', DOC_SUBSCRIPTION],
]

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(5_000_000_000_000_000 + i))
}

/** Serve `n` rows at `path` under `key`; the cursor is an opaque token, null at the end. */
function serve(path: string, key: string, n: number, template: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = []
  const all = ids(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    for (const k of Object.keys(params)) {
      if (k !== 'cursor' && k !== 'limit') throw new Error(`undocumented param ${k}`)
    }
    const limit = params['limit'] === undefined ? MAX : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) throw new Error('invalidLimit')
    const cursor = params['cursor'] as string | undefined
    const start = cursor === undefined ? 0 : Number(Buffer.from(cursor, 'base64').toString())
    const page = all.slice(start, start + limit)
    const end = start + limit >= all.length
    return {
      cursor: end ? null : Buffer.from(String(start + limit)).toString('base64'),
      [key]: page.map((id) => ({ ...template, id })),
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
  postMock.mockReset()
  _resetCursorPager()
})

describe('StarkBankAdapter capabilities', () => {
  it('declares the documented maximum of 100', () => {
    expect(adapter.capabilities.maxPageSize).toBe(MAX)
  })
})

describe.each(METHODS)('StarkBankAdapter.%s paging', (method, path, key, template) => {
  it('serves 2L+1 rows across three worker pages, each once, with exact hasMore', async () => {
    const L = 10
    const calls = serve(path, key, 2 * L + 1, template)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(2 * L + 1))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
    // Sequential walk: one request per page, carrying the previous cursor.
    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual({ limit: L })
    expect(calls[1]).toEqual({ limit: L, cursor: expect.any(String) })
  })

  it('walks the cursor chain for a cold request of page 3', async () => {
    const L = 5
    const calls = serve(path, key, 2 * L + 1, template)
    const params = withPageSink({ page: 3, limit: L })
    const rows = await call(method, params)
    expect(rows.map((r) => r.id)).toEqual(ids(2 * L + 1).slice(2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('clamps a limit above 100 and reports the size it sent', async () => {
    const calls = serve(path, key, 150, template)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await call(method, params)
    expect(calls[0]).toEqual({ limit: MAX })
    expect(rows).toHaveLength(MAX)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: MAX })
  })

  it.each([0, -3])('raises a limit of %s to the minimum of 1', async (asked) => {
    const calls = serve(path, key, 5, template)
    const rows = await call(method, withPageSink({ page: 1, limit: asked }))
    expect(calls[0]).toEqual({ limit: 1 })
    expect(rows).toHaveLength(1)
  })

  it('ends on a null cursor with hasMore false and no pageSize at the ask', async () => {
    serve(path, key, 3, template)
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await call(method, params)
    expect(rows).toHaveLength(3)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('does not pass search or updatedAfter through (no documented equivalent)', async () => {
    const calls = serve(path, key, 1, template)
    await call(
      method,
      withPageSink({
        page: 1,
        limit: 10,
        search: 'x',
        updatedAfter: new Date('2024-01-01T00:00:00Z'),
      }),
    )
    expect(calls[0]).toEqual({ limit: 10 })
  })
})

describe('StarkBankAdapter get methods read the documented single-entity key', () => {
  it.each([
    ['getInvoice', '/invoice/4600131349381120', 'invoice', DOC_INVOICE],
    ['getPayout', '/transfer/5950134772826112', 'transfer', DOC_TRANSFER],
    ['getBalanceTransaction', '/transaction/5185595898855424', 'transaction', DOC_TRANSACTION],
    [
      'getSubscription',
      '/invoice-pull-subscription/6633844090339328',
      'subscription',
      DOC_SUBSCRIPTION,
    ],
  ] as const)('%s → GET %s', async (method, path, key, record) => {
    getMock.mockImplementation(async (p: string) => {
      if (p !== path) throw new Error(`unexpected path ${p}`)
      return { [key]: record }
    })
    const fn = adapter[method].bind(adapter) as (
      c: Credentials,
      id: string,
    ) => Promise<{ id: string }>
    const out = await fn(CREDS, record.id)
    expect(out.id).toBe(record.id)
  })

  it.each([
    ['getInvoice', DOC_INVOICE, /no invoice/],
    ['getPayout', DOC_TRANSFER, /no transfer/],
    ['getBalanceTransaction', DOC_TRANSACTION, /no transaction/],
    ['getSubscription', DOC_SUBSCRIPTION, /no subscription/],
  ] as const)(
    '%s throws rather than inventing a record when the key is absent',
    async (method, record, msg) => {
      getMock.mockResolvedValue({ data: record })
      const fn = adapter[method].bind(adapter) as (c: Credentials, id: string) => Promise<unknown>
      await expect(fn(CREDS, record.id)).rejects.toThrow(msg)
    },
  )
})

describe('StarkBankAdapter refuses resources the API does not have', () => {
  it.each([
    ['listCustomers', /cannot list customers/],
    ['listCharges', /cannot list charges/],
    ['listRefunds', /cannot list refunds/],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends nothing', async (method, message) => {
    const fn = adapter[method].bind(adapter) as (c: Credentials, p: QueryParams) => Promise<unknown>
    const err = await fn(CREDS, { page: 1, limit: 10 }).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(message)
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it.each([['getCustomer'], ['getCharge']] as const)(
    '%s throws 501 NOT_SUPPORTED and sends nothing',
    async (method) => {
      const fn = adapter[method].bind(adapter) as (c: Credentials, id: string) => Promise<unknown>
      const err = await fn(CREDS, 'x').catch((e: unknown) => e)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(getMock).not.toHaveBeenCalled()
    },
  )
})

describe('StarkBankAdapter needs the project id', () => {
  it('refuses a connection without one before any request', async () => {
    const err = await adapter
      .listInvoices({ accessToken: 'pem-a' }, { page: 1, limit: 10 })
      .catch((e: unknown) => e)
    expect((err as Error).message).toMatch(/projectId/)
    expect(getMock).not.toHaveBeenCalled()
  })

  it('keeps separate cursor walks per project', async () => {
    serve('/invoice', 'invoices', 21, DOC_INVOICE)
    await adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: 10 }))
    getMock.mockClear()
    const other: Credentials = { accessToken: 'pem-a', extra: { projectId: '999' } }
    await adapter.listInvoices(other, withPageSink({ page: 2, limit: 10 }))
    // No remembered cursor for the other project: page 2 walks from page 1.
    expect(getMock).toHaveBeenCalledTimes(2)
  })
})
