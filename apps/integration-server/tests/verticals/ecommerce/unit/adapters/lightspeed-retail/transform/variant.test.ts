import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  untransformVariant,
  type RawLightspeedItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawLightspeedItem> = {}): RawLightspeedItem {
  return {
    itemID: '601',
    systemSku: 'SYS-601',
    customSku: 'SHIRT-SM-RED',
    description: 'T-Shirt Small Red',
    upc: '111222333444',
    itemMatrixID: '100',
    defaultCost: '5.00',
    Prices: {
      ItemPrice: { amount: '24.99', useType: 'Default' },
    },
    ...overrides,
  }
}

describe('transformVariant (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformVariant(makeItem())
    expect(result.id).toBe('601')
    expect(result.productId).toBe('100')
    expect(result.sku).toBe('SHIRT-SM-RED')
    expect(result.barcode).toBe('111222333444')
    expect(result.title).toBe('T-Shirt Small Red')
    expect(result.price).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('uses parentId fallback when no itemMatrixID', () => {
    const result = transformVariant(makeItem({ itemMatrixID: undefined }), 'PARENT_99')
    expect(result.productId).toBe('PARENT_99')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeItem())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformVariant', () => {
    const canonical = transformVariant(makeItem())
    const raw = untransformVariant(canonical)
    expect(raw['description']).toBe('T-Shirt Small Red')
    expect(raw['customSku']).toBe('SHIRT-SM-RED')
    expect(raw['itemMatrixID']).toBe('100')
  })
})
