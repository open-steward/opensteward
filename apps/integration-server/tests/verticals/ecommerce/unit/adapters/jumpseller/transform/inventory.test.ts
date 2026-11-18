import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformFlatStock,
  type RawJumpsellerStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumpseller/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (jumpseller)', () => {
  const stockLocation: RawJumpsellerStockLocation = {
    id: 7,
    name: 'Main Warehouse',
    stock: 30,
  }

  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(stockLocation, 'var-123')
    expect(result.id).toBe('var-123:7')
  })

  it('maps variantId', () => {
    const result = transformInventoryLevel(stockLocation, 'var-123')
    expect(result.variantId).toBe('var-123')
  })

  it('maps locationId to string', () => {
    const result = transformInventoryLevel(stockLocation, 'var-123')
    expect(result.locationId).toBe('7')
  })

  it('maps available from stock', () => {
    const result = transformInventoryLevel(stockLocation, 'var-123')
    expect(result.available).toBe(30)
  })

  it('defaults available to 0 when stock is null', () => {
    const result = transformInventoryLevel({ ...stockLocation, stock: null }, 'var-123')
    expect(result.available).toBe(0)
  })

  it('produces schema-valid output', () => {
    const result = transformInventoryLevel(stockLocation, 'var-123')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformFlatStock (jumpseller)', () => {
  it('synthesises id as variantId:default', () => {
    const result = transformFlatStock('var-456', 10)
    expect(result.id).toBe('var-456:default')
  })

  it('always uses locationId "default"', () => {
    const result = transformFlatStock('var-456', 10)
    expect(result.locationId).toBe('default')
  })

  it('maps available from stock', () => {
    const result = transformFlatStock('var-456', 10)
    expect(result.available).toBe(10)
  })

  it('defaults available to 0 when stock is null', () => {
    const result = transformFlatStock('var-456', null)
    expect(result.available).toBe(0)
  })

  it('produces schema-valid output', () => {
    const result = transformFlatStock('var-456', 5)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
