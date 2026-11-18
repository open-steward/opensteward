import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawNeweggInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/newegg/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(
  overrides: Partial<RawNeweggInventoryItem> = {},
): RawNeweggInventoryItem {
  return {
    SellerPartNumber: 'GPU-RTX4090-24G',
    NeweggItemNumber: '9SIAABC12345',
    AvailableQuantity: 25,
    FulfillmentOption: 'Seller',
    ...overrides,
  }
}

describe('transformInventoryLevel (Newegg)', () => {
  it('maps SellerPartNumber and quantity to canonical inventory level', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.variantId).toBe('GPU-RTX4090-24G')
    expect(result.available).toBe(25)
    expect(result.locationId).toBe('newegg-default')
  })

  it('uses WarehouseLocation as locationId when present', () => {
    const result = transformInventoryLevel(
      makeInventory({ WarehouseLocation: 'WH-LAX01' }),
    )
    expect(result.locationId).toBe('WH-LAX01')
    expect(result.id).toBe('GPU-RTX4090-24G:WH-LAX01')
  })

  it('synthesizes id as SellerPartNumber:locationId', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('GPU-RTX4090-24G:newegg-default')
  })

  it('defaults quantity to 0 when missing', () => {
    const result = transformInventoryLevel(makeInventory({ AvailableQuantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw)
    expect(result.metadata['FulfillmentOption']).toBe('Seller')
    expect(result.metadata['NeweggItemNumber']).toBe('9SIAABC12345')
    expect(result.metadata['SellerPartNumber']).toBe('GPU-RTX4090-24G')
  })
})
