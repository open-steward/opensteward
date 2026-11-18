import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTrendyolClaim,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeClaim(overrides: Partial<RawTrendyolClaim> = {}): RawTrendyolClaim {
  return {
    id: 88888,
    orderNumber: 'TY-2024-001',
    orderShipmentPackageId: 987654321,
    claimDate: 1704240000000, // 2024-01-03T00:00:00.000Z
    lastModifiedDate: 1704326400000, // 2024-01-04T00:00:00.000Z
    items: [
      {
        orderLine: {
          productName: 'Smart Headphones Pro',
          barcode: '8690000000001',
          quantity: 1,
          price: 299.99,
          currencyCode: 'TRY',
        },
        claimItems: [
          {
            id: 11111,
            orderLineItemId: 111,
            customerClaimItemReason: { name: 'Defective product' },
            claimItemStatus: { name: 'Approved' },
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('transformRefund (Trendyol)', () => {
  it('maps id as string from claim id', () => {
    const result = transformRefund(makeClaim())
    expect(result.id).toBe('88888')
  })

  it('maps orderId from orderShipmentPackageId', () => {
    const result = transformRefund(makeClaim())
    expect(result.orderId).toBe('987654321')
  })

  it('falls back orderId to orderNumber when packageId absent', () => {
    const result = transformRefund(makeClaim({ orderShipmentPackageId: null }))
    expect(result.orderId).toBe('TY-2024-001')
  })

  it('extracts reason from first claimItem reason', () => {
    const result = transformRefund(makeClaim())
    expect(result.reason).toBe('Defective product')
  })

  it('maps refundLineItems with amount converted to minor units', () => {
    const result = transformRefund(makeClaim())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('111')
    expect(result.refundLineItems![0]!.amount?.amount).toBe(29999)
    expect(result.refundLineItems![0]!.amount?.currency).toBe('TRY')
  })

  it('converts epoch ms claimDate to processedAt ISO string', () => {
    const result = transformRefund(makeClaim())
    expect(result.processedAt).toBe('2024-01-03T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeClaim()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeClaim())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles claim with no items gracefully', () => {
    const result = transformRefund(makeClaim({ items: [] }))
    expect(result.reason).toBeUndefined()
    expect(result.refundLineItems).toEqual([])
  })
})
