import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawTokopediaInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawTokopediaInventoryItem> = {}): RawTokopediaInventoryItem {
  return {
    productID: 987654321,
    shopID: 11223344,
    sku: 'BSS-001',
    stock: 50,
    reservedStock: 5,
    status: 1,
    updateTime: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Tokopedia)', () => {
  it('generates composite id from productID and location', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('987654321:tokopedia-default')
    expect(result.variantId).toBe('987654321')
    expect(result.locationId).toBe('tokopedia-default')
  })

  it('uses warehouseID as locationId when present', () => {
    const result = transformInventoryLevel(makeInventory({ warehouseID: 555 }))
    expect(result.id).toBe('987654321:555')
    expect(result.locationId).toBe('555')
  })

  it('maps available stock', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.available).toBe(50)
  })

  it('maps committed (reserved) stock', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.committed).toBe(5)
  })

  it('computes onHand from available + committed', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.onHand).toBe(55)
  })

  it('omits onHand when committed is undefined', () => {
    const result = transformInventoryLevel(makeInventory({ reservedStock: undefined }))
    expect(result.onHand).toBeUndefined()
  })

  it('preserves updatedAt', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('defaults to 0 available when stock is undefined', () => {
    const result = transformInventoryLevel(makeInventory({ stock: undefined }))
    expect(result.available).toBe(0)
  })

  it('preserves raw data in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw)
    expect(result.metadata['productID']).toBe(987654321)
    expect(result.metadata['sku']).toBe('BSS-001')
  })
})
