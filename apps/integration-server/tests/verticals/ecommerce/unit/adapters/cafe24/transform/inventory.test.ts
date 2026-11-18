import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawCafe24Inventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (cafe24)', () => {
  const raw: RawCafe24Inventory = {
    variant_code: 'P0000001-001',
    product_no: 12345,
    quantity: 50,
    safety_stock_quantity: 5,
    location: 'Main Warehouse',
    location_code: 'WH-001',
  }

  it('synthesises id as variantCode:locationCode', () => {
    expect(transformInventoryLevel(raw).id).toBe('P0000001-001:WH-001')
  })

  it('maps variantId from variant_code', () => {
    expect(transformInventoryLevel(raw).variantId).toBe('P0000001-001')
  })

  it('maps locationId from location_code', () => {
    expect(transformInventoryLevel(raw).locationId).toBe('WH-001')
  })

  it('maps available from quantity', () => {
    expect(transformInventoryLevel(raw).available).toBe(50)
  })

  it('clamps negative quantities to 0', () => {
    const result = transformInventoryLevel({ ...raw, quantity: -5 })
    expect(result.available).toBe(0)
  })

  it('defaults available to 0 when quantity is null', () => {
    const result = transformInventoryLevel({ ...raw, quantity: null })
    expect(result.available).toBe(0)
  })

  it('falls back to location string when location_code absent', () => {
    const result = transformInventoryLevel({ ...raw, location_code: null })
    expect(result.locationId).toBe('Main Warehouse')
    expect(result.id).toBe('P0000001-001:Main Warehouse')
  })

  it('defaults locationId to "cafe24" when both location and location_code absent', () => {
    const result = transformInventoryLevel({ ...raw, location: null, location_code: null })
    expect(result.locationId).toBe('cafe24')
  })

  it('uses variantCode parameter override', () => {
    const rawNoCode: RawCafe24Inventory = { ...raw, variant_code: null }
    const result = transformInventoryLevel(rawNoCode, 'OVERRIDE-CODE')
    expect(result.variantId).toBe('OVERRIDE-CODE')
  })

  it('passes InventoryLevelSchema validation', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel(raw))).not.toThrow()
  })
})
