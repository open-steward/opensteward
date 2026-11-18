/**
 * OzonAdapter.listTransactions — finance operations, with HTTP mocked.
 *
 * POST /v3/finance/transaction/list (FinanceAPI), from Ozon's official spec
 * (https://docs.ozon.ru/api/seller/, archived at
 * https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json):
 *   request  { filter: { date: { from, to }, transaction_type: "all", … }, page, page_size }
 *   response { result: { operations: [...], page_count, row_count } }
 * "The maximum period for one request is 1 month." The method states no
 * page_size ceiling; the spec's own request example sends `page_size: 1000`,
 * the ceiling its sibling list methods document.
 * Path confirmed live 2026-09-13.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { OzonAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ozon/index'

const CREDS = { accessToken: 'api-key-secret', extra: { clientId: '1943980' } }
const WINDOW = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' }

interface Call {
  path: string
  body: Record<string, unknown>
}

function fakeOzon(answer: (body: Record<string, unknown>) => unknown): Call[] {
  const calls: Call[] = []
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    calls.push({ path, body })
    return { data: answer(body) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return calls
}

const operation = (id: number) => ({
  operation_id: id,
  operation_type: 'OperationAgentDeliveredToCustomer',
  operation_date: '2026-08-10 00:00:00',
  amount: 100,
  type: 'orders',
  posting: { posting_number: `P-${id}` },
})

afterEach(() => vi.restoreAllMocks())

describe('OzonAdapter.listTransactions', () => {
  it('requests one page inside the window and reports more while page < page_count', async () => {
    const calls = fakeOzon(() => ({ result: { operations: [operation(7)], page_count: 3, row_count: 250 } }))
    const params = withPageSink({ page: 2, limit: 100, ...WINDOW })
    const txns = await new OzonAdapter().listTransactions(CREDS, params)
    expect(calls).toEqual([
      {
        path: '/v3/finance/transaction/list',
        body: { filter: { date: { from: WINDOW.from, to: WINDOW.to }, transaction_type: 'all' }, page: 2, page_size: 100 },
      },
    ])
    expect(txns.map((t) => t.id)).toEqual(['7'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports the last page and clamps page_size to 1000', async () => {
    const calls = fakeOzon(() => ({ result: { operations: [], page_count: 3, row_count: 250 } }))
    const params = withPageSink({ page: 3, limit: 5000, ...WINDOW })
    await new OzonAdapter().listTransactions(CREDS, params)
    expect(calls[0]!.body['page_size']).toBe(1000)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  // No window at all walks the full history — see history-walk.test.ts.
  it('refuses a half window: from without to (or to without from) makes no request', async () => {
    const calls = fakeOzon(() => ({ result: { operations: [], page_count: 0 } }))
    const adapter = new OzonAdapter()
    await expect(adapter.listTransactions(CREDS, withPageSink({ page: 1, limit: 10, from: WINDOW.from }))).rejects.toThrow(
      /pass both from and to, or neither/,
    )
    await expect(adapter.listTransactions(CREDS, withPageSink({ page: 1, limit: 10, to: WINDOW.to }))).rejects.toThrow(
      /pass both from and to, or neither/,
    )
    expect(calls).toHaveLength(0)
  })

  it('rejects a window longer than one month before calling Ozon', async () => {
    const calls = fakeOzon(() => ({ result: { operations: [], page_count: 0 } }))
    await expect(
      new OzonAdapter().listTransactions(
        CREDS,
        withPageSink({ page: 1, limit: 10, from: '2026-06-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }),
      ),
    ).rejects.toThrow(/at most one month/)
    expect(calls).toHaveLength(0)
  })
})
