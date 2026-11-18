/**
 * Pins the Finances requests for refunds and transactions.
 *
 * Both cells previously built their path as `${FINANCES_BASE}/orders/{id}`
 * off a `FINANCES_BASE` that itself pointed at the non-existent
 * `/finances/v2024-06-19/financialEvents`, and stamped a non-spec
 * `AmazonOrderId` query param onto the order-scoped refund call. Per
 * financesV0.json, the real routes are:
 *
 *   GET /finances/v0/financialEvents                          (no order)
 *   GET /finances/v0/orders/{orderId}/financialEvents          (order-scoped;
 *       NOT financialEvents/orders/{id} — the order id nests before the
 *       resource, not after it)
 *
 * with no `AmazonOrderId` query parameter on either route.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { AmazonSPAdapter } from '../../../../../../src/verticals/ecommerce/adapters/amazon-sp/index'
import { RefundSchema } from '../../../../../../src/verticals/ecommerce/schema/refund'
import { TransactionSchema } from '../../../../../../src/verticals/ecommerce/schema/transaction'

const CFG = { clientId: 'cid', clientSecret: 'sec' }
const CREDS = { accessToken: 'tok', extra: {} }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeHttp(answer: (path: string, params: Record<string, unknown> | undefined) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    return { data: answer(path, cfg?.params) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const REFUND_EVENT = {
  AmazonOrderId: '111-2222222-3333333',
  PostedDate: '2026-01-05T00:00:00Z',
  ShipmentItemAdjustmentList: [
    {
      OrderItemId: 'OI-1',
      QuantityShipped: 1,
      ItemChargeAdjustmentList: [
        { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', Amount: '-10.00' } },
      ],
    },
  ],
}

const EMPTY_FINANCIAL_EVENTS = { FinancialEvents: {} }

describe('listRefunds (Finances RefundEventList)', () => {
  it('without an order: GETs the base financialEvents path with a PostedAfter filter', async () => {
    const { calls } = fakeHttp(() => ({ payload: EMPTY_FINANCIAL_EVENTS }))
    await new AmazonSPAdapter(CFG).listRefunds(CREDS, {})
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/finances/v0/financialEvents')
    expect(calls[0]!.params?.['PostedAfter']).toBeTruthy()
    expect(calls[0]!.params?.['AmazonOrderId']).toBeUndefined()
  })

  it('with an order: GETs the order-scoped path, not `${FINANCES_BASE}/orders/{id}`', async () => {
    const { calls } = fakeHttp(() => ({
      payload: { FinancialEvents: { RefundEventList: [REFUND_EVENT] } },
    }))
    const out = await new AmazonSPAdapter(CFG).listRefunds(CREDS, { orderId: '111-2222222-3333333' } as never)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/finances/v0/orders/111-2222222-3333333/financialEvents')
    // No AmazonOrderId query — the order id lives in the path, per spec.
    expect(calls[0]!.params?.['AmazonOrderId']).toBeUndefined()
    // No PostedAfter — the order-scoped route only takes MaxResultsPerPage/NextToken.
    expect(calls[0]!.params?.['PostedAfter']).toBeUndefined()
    expect(calls[0]!.params?.['MaxResultsPerPage']).toBeTruthy()
    expect(() => RefundSchema.parse(out[0])).not.toThrow()
  })

  it('getRefund resolves through the order-scoped path', async () => {
    const { calls } = fakeHttp(() => ({
      payload: { FinancialEvents: { RefundEventList: [REFUND_EVENT] } },
    }))
    const r = await new AmazonSPAdapter(CFG).getRefund(
      CREDS,
      '111-2222222-3333333:2026-01-05T00:00:00Z',
    )
    expect(calls[0]!.path).toBe('/finances/v0/orders/111-2222222-3333333/financialEvents')
    expect(r.id).toBe('111-2222222-3333333:2026-01-05T00:00:00Z')
  })
})

const SHIPMENT_EVENT = {
  AmazonOrderId: '111-2222222-3333333',
  PostedDate: '2026-01-05T00:00:00Z',
  ShipmentItemList: [
    {
      OrderItemId: 'OI-1',
      ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', Amount: '10.00' } }],
    },
  ],
}

describe('listTransactions (Finances FinancialEvents)', () => {
  it('without an order: GETs the base financialEvents path with a PostedAfter filter', async () => {
    const { calls } = fakeHttp(() => ({ payload: EMPTY_FINANCIAL_EVENTS }))
    await new AmazonSPAdapter(CFG).listTransactions(CREDS, {})
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/finances/v0/financialEvents')
    expect(calls[0]!.params?.['PostedAfter']).toBeTruthy()
  })

  it('with an order: GETs the order-scoped path, not `${FINANCES_BASE}/orders/{id}`', async () => {
    const { calls } = fakeHttp(() => ({
      payload: { FinancialEvents: { ShipmentEventList: [SHIPMENT_EVENT] } },
    }))
    const out = await new AmazonSPAdapter(CFG).listTransactions(CREDS, {
      orderId: '111-2222222-3333333',
    } as never)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/finances/v0/orders/111-2222222-3333333/financialEvents')
    expect(calls[0]!.params?.['PostedAfter']).toBeUndefined()
    expect(() => TransactionSchema.parse(out[0])).not.toThrow()
  })

  it('getTransaction resolves through the order-scoped path', async () => {
    const { calls } = fakeHttp(() => ({
      payload: { FinancialEvents: { ShipmentEventList: [SHIPMENT_EVENT] } },
    }))
    const t = await new AmazonSPAdapter(CFG).getTransaction(
      CREDS,
      '111-2222222-3333333:ShipmentEvent:2026-01-05T00:00:00Z',
    )
    expect(calls[0]!.path).toBe('/finances/v0/orders/111-2222222-3333333/financialEvents')
    expect(t.id).toBe('111-2222222-3333333:ShipmentEvent:2026-01-05T00:00:00Z')
  })
})
