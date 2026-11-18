import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
} from '../../../../../../../src/verticals/ecommerce/adapters/amazon-sp/transform/fulfillment'
import type { RawAmazonOrderItem } from '../../../../../../../src/verticals/ecommerce/adapters/amazon-sp/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeItem(overrides: Partial<RawAmazonOrderItem> = {}): RawAmazonOrderItem {
  return {
    ASIN: 'B0ABCDE123',
    SellerSKU: 'TEE-S-BLUE',
    OrderItemId: 'OI-9001',
    Title: 'Ocean Blue T-Shirt',
    QuantityOrdered: 2,
    QuantityShipped: 2,
    ItemPrice: { CurrencyCode: 'USD', Amount: '49.98' },
    FulfillmentChannel: 'AFN',
    ...overrides,
  }
}

describe('transformFulfillment (AmazonSP)', () => {
  it('builds a composite id and maps AFN to the FBA service slot', () => {
    const f = transformFulfillment('123-4567890-1234567', makeItem())
    expect(f.id).toBe('123-4567890-1234567:OI-9001')
    expect(f.orderId).toBe('123-4567890-1234567')
    expect(f.service).toBe('FBA')
    expect(f.status).toBe('SUCCESS')
  })

  it('infers status from quantity shipped vs ordered', () => {
    expect(transformFulfillment('O1', makeItem({ QuantityShipped: 0 })).status).toBe('PENDING')
    expect(transformFulfillment('O1', makeItem({ QuantityShipped: 1 })).status).toBe('OPEN')
    expect(transformFulfillment('O1', makeItem({ QuantityShipped: 2 })).status).toBe('SUCCESS')
  })

  it('maps MFN to FBM and exposes the ASIN through metadata', () => {
    const f = transformFulfillment(
      'O2',
      makeItem({ FulfillmentChannel: 'MFN' }),
    )
    expect(f.service).toBe('FBM')
    expect((f.metadata as { asin?: string }).asin).toBe('B0ABCDE123')
    expect((f.metadata as { sellerSku?: string }).sellerSku).toBe('TEE-S-BLUE')
  })

  it('emits one canonical fulfillment per OrderItem', () => {
    const list = transformFulfillments('O3', [
      makeItem({ OrderItemId: 'A', QuantityShipped: 0 }),
      makeItem({ OrderItemId: 'B', QuantityShipped: 2 }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('O3:A')
    expect(list[0]!.status).toBe('PENDING')
    expect(list[1]!.id).toBe('O3:B')
    expect(list[1]!.status).toBe('SUCCESS')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const f = transformFulfillment('O4', makeItem())
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })
})
