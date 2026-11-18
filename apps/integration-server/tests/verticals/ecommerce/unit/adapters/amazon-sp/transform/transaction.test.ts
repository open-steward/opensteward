import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawAmazonFinancialEvent,
} from '../../../../../../../src/verticals/ecommerce/adapters/amazon-sp/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeShipmentEvent(
  overrides: Partial<RawAmazonFinancialEvent> = {},
): RawAmazonFinancialEvent {
  return {
    eventType: 'ShipmentEvent',
    AmazonOrderId: '123-4567890-1234567',
    SellerOrderId: 'SO-1001',
    MarketplaceName: 'Amazon.com',
    PostedDate: '2024-05-02T08:00:00Z',
    ShipmentItemList: [
      {
        SellerSKU: 'TEE-S-BLUE',
        OrderItemId: 'OI-9001',
        QuantityShipped: 2,
        ItemChargeList: [
          { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', Amount: '49.98' } },
          { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'USD', Amount: '4.12' } },
        ],
      },
    ],
    BuyerInfo: {
      BuyerEmail: 'buyer@example.com',
    },
    ...overrides,
  }
}

describe('transformTransaction (AmazonSP)', () => {
  it('maps ShipmentEvent to a CAPTURE transaction with aggregated amount', () => {
    const t = transformTransaction(makeShipmentEvent())
    expect(t.id).toBe('123-4567890-1234567:ShipmentEvent:2024-05-02T08:00:00Z')
    expect(t.orderId).toBe('123-4567890-1234567')
    expect(t.kind).toBe('CAPTURE')
    expect(t.status).toBe('SUCCESS')
    // 49.98 + 4.12 = 54.10 → 5410 minor units.
    expect(t.amount?.amount).toBe(5410)
    expect(t.amount?.currency).toBe('USD')
    expect(t.gateway).toBe('amazon')
  })

  it('maps RefundEvent to a REFUND transaction', () => {
    const t = transformTransaction({
      eventType: 'RefundEvent',
      AmazonOrderId: '123-4567890-1234567',
      PostedDate: '2024-05-15T09:00:00Z',
      ShipmentItemAdjustmentList: [
        {
          ItemChargeAdjustmentList: [
            {
              ChargeType: 'Principal',
              ChargeAmount: { CurrencyCode: 'USD', Amount: '-24.99' },
            },
          ],
        },
      ],
    })
    expect(t.kind).toBe('REFUND')
    expect(t.amount).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps AdjustmentEvent via the top-level AdjustmentAmount', () => {
    const t = transformTransaction({
      eventType: 'AdjustmentEvent',
      AmazonOrderId: '123-4567890-1234567',
      PostedDate: '2024-05-20T10:00:00Z',
      AdjustmentType: 'FBAInventoryReimbursement',
      AdjustmentAmount: { CurrencyCode: 'USD', Amount: '15.00' },
    })
    expect(t.kind).toBe('CAPTURE')
    expect(t.amount).toEqual({ amount: 1500, currency: 'USD' })
  })

  it('produces a payload that satisfies TransactionSchema and preserves raw in metadata', () => {
    const raw = makeShipmentEvent()
    const t = transformTransaction(raw)
    expect(() => TransactionSchema.parse(t)).not.toThrow()
    expect(t.metadata).toBe(raw)
  })

  it('does NOT leak buyer PII onto the canonical transaction', () => {
    const t = transformTransaction(makeShipmentEvent())
    // Transaction has no top-level PII fields. The raw event is kept in
    // metadata unchanged, but the transform must not copy buyer info
    // into canonical slots.
    expect((t as unknown as { email?: string }).email).toBeUndefined()
    expect((t as unknown as { customerId?: string }).customerId).toBeUndefined()
  })
})
