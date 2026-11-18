import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawJtlShopStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (jtl-shop)', () => {
  const raw: RawJtlShopStock = {
    articleId: 77,
    variantId: 88,
    available: 25,
    reserved: 3,
    onHand: 28,
    incoming: 10,
    updatedAt: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as variantId:default', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.id).toBe('var-88:default')
  })

  it('uses provided variantId', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.variantId).toBe('var-88')
  })

  it('always sets locationId to "default"', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.locationId).toBe('default')
  })

  it('maps available quantity', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.available).toBe(25)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel({ ...raw, available: null }, 'var-88')
    expect(result.available).toBe(0)
  })

  it('maps committed from reserved', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.committed).toBe(3)
  })

  it('maps incoming', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.incoming).toBe(10)
  })

  it('maps onHand', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.onHand).toBe(28)
  })

  it('maps updatedAt', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformInventoryLevel(raw, 'var-88')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
