import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawScapiInventoryRecord,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRecord(overrides: Partial<RawScapiInventoryRecord> = {}): RawScapiInventoryRecord {
  return {
    productId: 'product-abc',
    inventoryListId: 'warehouse-eu',
    perpetual: false,
    allocation: 50,
    ats: 45,
    reserved: 5,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('constructs id as locationId:productId', () => {
    const result = transformInventoryLevel(makeRecord())
    expect(result.id).toBe('warehouse-eu:product-abc')
  })

  it('uses productId as variantId', () => {
    const result = transformInventoryLevel(makeRecord())
    expect(result.variantId).toBe('product-abc')
  })

  it('uses inventoryListId as locationId', () => {
    const result = transformInventoryLevel(makeRecord())
    expect(result.locationId).toBe('warehouse-eu')
  })

  it('falls back to "default" locationId when inventoryListId absent', () => {
    const result = transformInventoryLevel(makeRecord({ inventoryListId: undefined }))
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('default:product-abc')
  })

  it('uses ats as available', () => {
    const result = transformInventoryLevel(makeRecord())
    expect(result.available).toBe(45)
  })

  it('falls back to allocation when ats absent', () => {
    const result = transformInventoryLevel(makeRecord({ ats: undefined }))
    expect(result.available).toBe(50)
  })

  it('reports sentinel value for perpetual inventory', () => {
    const result = transformInventoryLevel(makeRecord({ perpetual: true }))
    expect(result.available).toBe(9_999_999)
  })

  it('clamps negative available to 0', () => {
    const result = transformInventoryLevel(makeRecord({ ats: -10, allocation: -5 }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRecord()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRecord())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
