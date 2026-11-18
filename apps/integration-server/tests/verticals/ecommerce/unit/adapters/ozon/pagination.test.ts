/**
 * Ozon list paging and posting cancellation, with the HTTP layer mocked.
 *
 * The sync worker asks for numeric `{ page, limit }`; Ozon pages two ways,
 * both from its official Seller API spec
 * (https://docs.ozon.ru/api/seller/, archived at
 * https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json):
 *
 *  - POST /v3/posting/fbs/list — `limit` (1–1000) + `offset`, `result.has_next`,
 *    and a mandatory `filter.since`/`filter.to` window of at most one year.
 *  - POST /v3/returns/company/fbs — `limit` (1–1000) + `last_id` cursor
 *    ("returns whose ids are greater than last_id").
 *
 * POST /v2/posting/fbs/cancel takes `posting_number`, `cancel_reason_id` and,
 * for reason 402 ("other"), a required `cancel_reason_message`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { OzonAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ozon/index'

const CREDS = { accessToken: 'api-key-secret', extra: { clientId: '1943980' } }
const WINDOW = { since: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }

interface Call {
  path: string
  body: Record<string, unknown>
}

function fakeOzon(answer: (path: string, body: Record<string, unknown>) => unknown): Call[] {
  const calls: Call[] = []
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    calls.push({ path, body })
    return { data: answer(path, body) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return calls
}

const posting = (n: number) => ({ posting_number: `P-${n}`, status: 'delivered', products: [] })
const fbsReturn = (id: number) => ({ id, posting_number: `P-${id}`, sku: 1, quantity: 1 })

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('OzonAdapter.listOrders', () => {
  it('declares Ozon’s 1000-row ceiling so the worker never reads a clamped page as the last', () => {
    expect(new OzonAdapter().capabilities.maxPageSize).toBe(1000)
  })

  it('maps page/limit to offset/limit inside the requested window, in a stable order', async () => {
    const calls = fakeOzon(() => ({ result: { postings: [posting(101)], has_next: true } }))
    const params = withPageSink({ page: 2, limit: 100, ...WINDOW })
    const orders = await new OzonAdapter().listOrders(CREDS, params)
    expect(calls).toEqual([
      {
        path: '/v3/posting/fbs/list',
        // `dir` spelled as in the spec's own request example ("dir": "ASC").
        body: { dir: 'ASC', filter: { since: WINDOW.since, to: WINDOW.to }, limit: 100, offset: 100 },
      },
    ])
    expect(orders.map((o) => o.id)).toEqual(['P-101'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('clamps the worker’s oversized limit to 1000 and reports the end from has_next', async () => {
    const calls = fakeOzon(() => ({ result: { postings: [posting(1)], has_next: false } }))
    const params = withPageSink({ page: 1, limit: 5000, ...WINDOW })
    await new OzonAdapter().listOrders(CREDS, params)
    expect(calls[0]!.body).toMatchObject({ limit: 1000, offset: 0 })
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('passes a status filter through', async () => {
    const calls = fakeOzon(() => ({ result: { postings: [], has_next: false } }))
    await new OzonAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10, ...WINDOW, status: 'awaiting_packaging' }))
    expect(calls[0]!.body['filter']).toEqual({ ...WINDOW, status: 'awaiting_packaging' })
  })

  // No window at all walks the full history — see history-walk.test.ts.
  it('refuses a half window: since without to (or to without since) makes no request', async () => {
    const calls = fakeOzon(() => ({ result: { postings: [], has_next: false } }))
    const adapter = new OzonAdapter()
    await expect(adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 10, since: WINDOW.since }))).rejects.toThrow(
      /pass both since and to, or neither/,
    )
    await expect(adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 10, to: WINDOW.to }))).rejects.toThrow(
      /pass both since and to, or neither/,
    )
    expect(calls).toHaveLength(0)
  })

  it('rejects a window longer than Ozon’s one-year maximum before calling Ozon', async () => {
    const calls = fakeOzon(() => ({ result: { postings: [], has_next: false } }))
    await expect(
      new OzonAdapter().listOrders(
        CREDS,
        withPageSink({ page: 1, limit: 10, since: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }),
      ),
    ).rejects.toThrow(/at most one year/)
    expect(calls).toHaveLength(0)
  })
})

describe('OzonAdapter.listRefunds', () => {
  it('walks the last_id cursor: page 2 starts after the last id of page 1', async () => {
    const pages: Record<string, unknown> = {
      first: { returns: [fbsReturn(11), fbsReturn(12)], last_id: 12 },
      '12': { returns: [fbsReturn(13)], last_id: 13 },
    }
    const calls = fakeOzon((_path, body) => pages[body['last_id'] == null ? 'first' : String(body['last_id'])])
    const adapter = new OzonAdapter()

    const p1 = withPageSink({ page: 1, limit: 2 })
    expect((await adapter.listRefunds(CREDS, p1)).map((r) => r.id)).toEqual(['11', '12'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 2 })
    expect((await adapter.listRefunds(CREDS, p2)).map((r) => r.id)).toEqual(['13'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)

    expect(calls).toEqual([
      { path: '/v3/returns/company/fbs', body: { filter: {}, limit: 2 } },
      { path: '/v3/returns/company/fbs', body: { filter: {}, limit: 2, last_id: 12 } },
    ])
  })

  it('clamps limit to 1000', async () => {
    const calls = fakeOzon(() => ({ returns: [], last_id: 0 }))
    await new OzonAdapter().listRefunds(CREDS, withPageSink({ page: 1, limit: 5000 }))
    expect(calls[0]!.body['limit']).toBe(1000)
  })

  it('skips return rows with no posting number instead of inventing an order id', async () => {
    fakeOzon(() => ({ returns: [fbsReturn(11), { ...fbsReturn(12), posting_number: '' }], last_id: 12 }))
    const refunds = await new OzonAdapter().listRefunds(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(refunds.map((r) => r.id)).toEqual(['11'])
  })
})

describe('OzonAdapter.cancelOrder', () => {
  const cancelled = { result: { posting_number: 'P-1', status: 'cancelled', products: [] } }

  it('sends a numeric reason as Ozon’s cancel_reason_id, then returns the posting', async () => {
    const calls = fakeOzon((path) => (path === '/v2/posting/fbs/cancel' ? { result: true } : cancelled))
    const order = await new OzonAdapter().cancelOrder(CREDS, 'P-1', { reason: '352' })
    expect(calls).toEqual([
      { path: '/v2/posting/fbs/cancel', body: { posting_number: 'P-1', cancel_reason_id: 352 } },
      { path: '/v3/posting/fbs/get', body: { posting_number: 'P-1' } },
    ])
    expect(order.id).toBe('P-1')
  })

  it('sends free text as reason 402 ("other") with the required message', async () => {
    const calls = fakeOzon((path) => (path === '/v2/posting/fbs/cancel' ? { result: true } : cancelled))
    await new OzonAdapter().cancelOrder(CREDS, 'P-1', { reason: 'Buyer asked to cancel' })
    expect(calls[0]!.body).toEqual({
      posting_number: 'P-1',
      cancel_reason_id: 402,
      cancel_reason_message: 'Buyer asked to cancel',
    })
  })

  it('makes no request without a reason — Ozon requires one', async () => {
    const calls = fakeOzon(() => ({ result: true }))
    await expect(new OzonAdapter().cancelOrder(CREDS, 'P-1')).rejects.toThrow(/Ozon requires a cancellation reason/)
    await expect(new OzonAdapter().cancelOrder(CREDS, 'P-1', { reason: '402' })).rejects.toThrow(
      /Ozon requires a cancellation reason/,
    )
    expect(calls).toHaveLength(0)
  })

  it('fails loudly when Ozon answers result: false', async () => {
    fakeOzon(() => ({ result: false }))
    await expect(new OzonAdapter().cancelOrder(CREDS, 'P-1', { reason: '352' })).rejects.toThrow(
      /Ozon did not cancel posting P-1/,
    )
  })
})
