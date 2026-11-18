/**
 * Haravan adapter — request shape, pagination, and auth-url wiring, with HTTP
 * mocked. `getAuthUrl` and one representative request are covered here;
 * transform behaviour is covered under transform/*.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { HaravanAdapter } from '../../../../../../src/verticals/ecommerce/adapters/haravan/index'
import { HaravanClient } from '../../../../../../src/verticals/ecommerce/adapters/haravan/client'
import { withPageSink, readUpstreamPage, type QueryParams } from '@opensteward/shared'

const CFG = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app.example.com/callback' }
const CREDS = { accessToken: 'tok-abc' }

afterEach(() => vi.restoreAllMocks())

function fakeHaravan(handlers: {
  get?: (path: string, params?: Record<string, unknown>) => unknown
}) {
  const getCalls: Array<{ path: string; params?: Record<string, unknown> }> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    getCalls.push({ path, params: cfg?.params })
    return { data: handlers.get?.(path, cfg?.params) ?? {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { getCalls }
}

describe('HaravanAdapter.getAuthUrl', () => {
  it('builds the authorize URL and honours overrideScopes', () => {
    const adapter = new HaravanAdapter(CFG)
    const url = new URL(adapter.getAuthUrl('state1', ['com.read_orders']))
    expect(url.hostname).toBe('accounts.haravan.com')
    expect(url.searchParams.get('scope')).toBe('com.read_orders')
    expect(url.searchParams.get('client_id')).toBe('cid')
  })
})

describe('HaravanAdapter list requests', () => {
  it('listCustomers sends only page/limit (clamped to 50) with a Bearer token — nothing else the sync worker didn’t pass', async () => {
    const { getCalls } = fakeHaravan({
      get: (path) => (path === 'customers.json' ? { customers: [] } : { shop: { currency: 'VND' } }),
    })
    const adapter = new HaravanAdapter(CFG)
    await adapter.listCustomers(CREDS, { page: 2, limit: 500 })
    const call = getCalls.find((c) => c.path === 'customers.json')!
    expect(call.params).toEqual({ page: 2, limit: 50 })
  })

  it('hits apis.haravan.com/com with Authorization: Bearer <token>', () => {
    const create = vi.spyOn(axios, 'create')
    new HaravanClient(CREDS)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://apis.haravan.com/com',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-abc' }),
      }),
    )
  })
})

describe('HaravanAdapter flattened lists report where the PARENT page ends', () => {
  // Refunds, transactions and store-wide variants have no list of their own;
  // each is answered from one page of orders (or products). The adapter
  // declares `maxPageSize: 50`, so without a report the sync worker reads a
  // page of 50 orders holding 3 refunds as a SHORT page — the proven end — and
  // stops after one page of orders, vouches for that as the whole collection,
  // and removes every cached refund from the orders it never asked for.
  const orders = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, refunds: [], transactions: [] }))
  const products = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, variants: [] }))

  function fake(parentCount: number) {
    return fakeHaravan({
      get: (path) =>
        path === 'orders.json'
          ? { orders: orders(parentCount) }
          : path === 'products.json'
            ? { products: products(parentCount) }
            : { shop: { currency: 'VND' } },
    })
  }

  const cases = [
    ['listRefunds', (a: HaravanAdapter, p: QueryParams) => a.listRefunds(CREDS, p)],
    ['listTransactions', (a: HaravanAdapter, p: QueryParams) => a.listTransactions(CREDS, p)],
    ['listVariants', (a: HaravanAdapter, p: QueryParams) => a.listVariants(CREDS, p)],
  ] as const

  it.each(cases)('%s: a full parent page with no children is not the end', async (_name, list) => {
    fake(50)
    const params = withPageSink({ page: 1, limit: 50 })
    const rows = await list(new HaravanAdapter(CFG), params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it.each(cases)('%s: a short parent page is the end', async (_name, list) => {
    fake(3)
    const params = withPageSink({ page: 2, limit: 50 })
    await list(new HaravanAdapter(CFG), params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
