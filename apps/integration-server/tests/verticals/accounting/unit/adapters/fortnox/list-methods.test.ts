/**
 * Fortnox is the accounting reference adapter, but it implemented only 5 of the
 * 12 entries in `verticals/accounting/sync/listable-resources.ts`. The sync
 * worker duck-types each method (`typeof adapter[method] === 'function'`,
 * sync-worker.ts:236) and silently marks the rest `skipped` — the job still
 * reports `completed`, so a connection synced 5/12 resources with no error
 * anywhere. Every list method is optional on `AccountingAdapter`, so tsc saw
 * nothing either.
 *
 * The transforms for the missing resources already existed and were unit
 * tested; nothing imported them. These tests pin the wiring: the endpoint each
 * method calls, the wrapper key it reads, and that the rows it returns satisfy
 * the canonical schema.
 *
 * Endpoints are the documented Fortnox API v3 resources (`/orders`,
 * `/purchaseorders`, `/invoicepayments`). `listSalesOrders` shares `/orders`
 * with `listOrders` — Fortnox models one order entity, and that is what the
 * other 124 accounting adapters implementing both methods do (see visma).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FortnoxAdapter } from '../../../../../../src/verticals/accounting/adapters/fortnox'
import { FortnoxClient } from '../../../../../../src/verticals/accounting/adapters/fortnox/client'
import { OrderSchema } from '../../../../../../src/verticals/accounting/schema/order'
import { SalesOrderSchema } from '../../../../../../src/verticals/accounting/schema/salesorder'
import { TransactionSchema } from '../../../../../../src/verticals/accounting/schema/transaction'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new FortnoxAdapter({
  clientId: 'test-id',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3010/auth/accounting/fortnox/callback',
  scopes: ['invoice'],
})

const creds = { accessToken: 'tok' } as Credentials

/** Spy on the shared client and record the path + params it was called with. */
function stubGet(payload: unknown) {
  const spy = vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue(payload as never)
  return spy
}

afterEach(() => vi.restoreAllMocks())

const ORDER_ROW = {
  DocumentNumber: '1001',
  CustomerNumber: 'C1',
  CustomerName: 'Acme AB',
  Currency: 'SEK',
  Total: 1250,
  OrderDate: '2024-03-01',
  Status: 'invoiced',
  DeliveryAddress1: 'Storgatan 1',
  DeliveryAddress2: '',
  DeliveryCity: 'Stockholm',
  DeliveryZipCode: '11122',
  DeliveryCountryCode: 'SE',
  Address1: 'Storgatan 1',
  Address2: '',
  City: 'Stockholm',
  ZipCode: '11122',
  CountryCode: 'SE',
  OrderRows: [
    {
      RowId: 1,
      ArticleNumber: 'ART-1',
      Description: 'Widget',
      Price: 250,
      OrderedQuantity: 5,
      Total: 1250,
      VAT: 312,
      AccountNumber: '3001',
      Discount: 0,
    },
  ],
}

const PAYMENT_ROW = {
  Number: 'P-1',
  InvoiceNumber: '1001',
  Amount: 1250,
  AmountCurrency: 1250,
  Currency: 'SEK',
  PaymentDate: '2024-03-05',
  Source: 'bank',
  AccountNumber: '1930',
  WriteOffs: [{ WriteOffAmount: 5, AccountNumber: '3740', Description: 'Öresavrundning' }],
  CustomerNumber: 'C1',
  CustomerName: 'Acme AB',
}

describe('FortnoxAdapter.listOrders', () => {
  it('reads the Orders wrapper from GET /orders', async () => {
    const spy = stubGet({ Orders: [ORDER_ROW] })
    const rows = await adapter.listOrders(creds, { limit: 5, page: 2 })

    expect(spy).toHaveBeenCalledWith('orders', expect.objectContaining({ limit: 5, page: 2 }))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('1001')
    expect(rows[0]!.type).toBe('SALES')
    expect(() => OrderSchema.parse(rows[0])).not.toThrow()
  })

  it('returns [] when the wrapper key is absent', async () => {
    stubGet({})
    await expect(adapter.listOrders(creds, {})).resolves.toEqual([])
  })

  it('propagates an upstream failure rather than reporting "no orders"', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockRejectedValue(new Error('Fortnox 500'))
    await expect(adapter.listOrders(creds, {})).rejects.toThrow('Fortnox 500')
  })
})

describe('FortnoxAdapter.listSalesOrders', () => {
  it('reads the Orders wrapper from GET /orders', async () => {
    const spy = stubGet({ Orders: [ORDER_ROW] })
    const rows = await adapter.listSalesOrders(creds, { limit: 5 })

    expect(spy).toHaveBeenCalledWith('orders', expect.objectContaining({ limit: 5 }))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('1001')
    expect(() => SalesOrderSchema.parse(rows[0])).not.toThrow()
  })

  it('returns [] when the wrapper key is absent', async () => {
    stubGet({})
    await expect(adapter.listSalesOrders(creds, {})).resolves.toEqual([])
  })

  it('propagates an upstream failure', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockRejectedValue(new Error('Fortnox 500'))
    await expect(adapter.listSalesOrders(creds, {})).rejects.toThrow('Fortnox 500')
  })
})

describe('FortnoxAdapter.listPurchaseOrders', () => {
  /**
   * Deliberately NOT implemented. `/3/purchaseorders` does not exist — Fortnox
   * answers a GET to it with:
   *
   *   {"error":1,"message":"No such route.(method: GET, path: 3/purchaseorders)","code":2000764}
   *
   * It was wired anyway on the strength of a docs summary that listed the path,
   * which is exactly the mistake docs/architecture/transform-conformance.md §7
   * warns about: a source that was not a real response is not evidence. The
   * result was a sync job that reported `failed` on every run, and an MCP
   * `list_purchase_orders` call that returned an unexplained 400.
   *
   * Absent, the sync worker marks the resource `skipped` — the same honest
   * state taxrates and expenses already carry for the same reason.
   */
  it('is not implemented, so the worker skips rather than fails', () => {
    expect(
      (adapter as unknown as Record<string, unknown>)['listPurchaseOrders'],
    ).toBeUndefined()
  })
})

describe('FortnoxAdapter.listTransactions', () => {
  it('reads the InvoicePayments wrapper from GET /invoicepayments', async () => {
    const spy = stubGet({ InvoicePayments: [PAYMENT_ROW] })
    const rows = await adapter.listTransactions(creds, { limit: 5 })

    expect(spy).toHaveBeenCalledWith('invoicepayments', expect.objectContaining({ limit: 5 }))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('P-1')
    expect(rows[0]!.reference).toBe('1001')
    expect(() => TransactionSchema.parse(rows[0])).not.toThrow()
  })

  it('returns [] when the wrapper key is absent', async () => {
    stubGet({})
    await expect(adapter.listTransactions(creds, {})).resolves.toEqual([])
  })

  it('propagates an upstream failure', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockRejectedValue(new Error('Fortnox 500'))
    await expect(adapter.listTransactions(creds, {})).rejects.toThrow('Fortnox 500')
  })
})

describe('the sync worker can reach every method it is told to call', () => {
  // Mirrors the worker's own duck-typing check (sync-worker.ts:236). Guards the
  // exact gap that left 7 resources silently `skipped`.
  it.each(['listOrders', 'listSalesOrders', 'listTransactions'])(
    '%s is a function on FortnoxAdapter',
    (method) => {
      expect(typeof (adapter as unknown as Record<string, unknown>)[method]).toBe('function')
    },
  )
})
