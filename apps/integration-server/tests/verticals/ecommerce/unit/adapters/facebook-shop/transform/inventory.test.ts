import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/inventory'
import type { RawFacebookProduct } from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeProduct(overrides: Partial<RawFacebookProduct> = {}): RawFacebookProduct {
  return {
    id: '1234567890',
    name: 'Vintage Leather Bag',
    inventory: 42,
    ...overrides,
  }
}

describe('transformInventoryLevel (Facebook Shop)', () => {
  it('uses the product id as variantId and a synthetic facebook-default location', () => {
    const lvl = transformInventoryLevel(makeProduct())
    expect(lvl.id).toBe('1234567890:facebook-default')
    expect(lvl.variantId).toBe('1234567890')
    expect(lvl.locationId).toBe('facebook-default')
  })

  it('reads quantity from inventory field', () => {
    const lvl = transformInventoryLevel(makeProduct())
    expect(lvl.available).toBe(42)
  })

  it('defaults to 0 when inventory is absent', () => {
    const lvl = transformInventoryLevel(makeProduct({ inventory: undefined }))
    expect(lvl.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const lvl = transformInventoryLevel(raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel(makeProduct())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })
})
