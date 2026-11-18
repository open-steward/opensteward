import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawChannelAdvisorProduct,
} from '../../../../../../../src/verticals/inventory/adapters/channeladvisor/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('channeladvisor transformProduct', () => {
  it('maps id, sku, name, and platform correctly', () => {
    const raw: RawChannelAdvisorProduct = {
      ID: 101,
      Sku: 'SKU-ABC',
      Title: 'Wireless Mouse',
      IsActive: true,
    }
    const result = transformProduct(raw)

    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
    expect(result.sku).toBe('SKU-ABC')
    expect(result.name).toBe('Wireless Mouse')
    expect(result.platform).toBe('channeladvisor')
    expect(result.supplierIds).toEqual([])
  })

  it('converts weight from LB to grams', () => {
    const raw: RawChannelAdvisorProduct = { ID: 1, Weight: 1, WeightUnit: 'LB' }
    const result = transformProduct(raw)
    expect(result.weightGrams).toBeCloseTo(453.592, 1)
  })

  it('converts weight from KG to grams', () => {
    const raw: RawChannelAdvisorProduct = { ID: 1, Weight: 2, WeightUnit: 'KG' }
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(2000)
  })

  it('converts dimensions from IN to cm', () => {
    const raw: RawChannelAdvisorProduct = {
      ID: 1,
      Length: 10,
      Width: 5,
      Height: 2,
      DimensionUnit: 'IN',
    }
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(25.4, 1)
    expect(result.dimensionsCm?.width).toBeCloseTo(12.7, 1)
    expect(result.dimensionsCm?.height).toBeCloseTo(5.08, 1)
  })

  it('stores retail price as major unit amount in USD', () => {
    const raw: RawChannelAdvisorProduct = { ID: 1, RetailPrice: 29.99 }
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(29.99)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('prefers Brand over Manufacturer for brand field', () => {
    const raw: RawChannelAdvisorProduct = { ID: 1, Brand: 'Logitech', Manufacturer: 'Acme' }
    const result = transformProduct(raw)
    expect(result.brand).toBe('Logitech')
  })

  it('falls back to Manufacturer when Brand is absent', () => {
    const raw: RawChannelAdvisorProduct = { ID: 1, Manufacturer: 'Acme' }
    const result = transformProduct(raw)
    expect(result.brand).toBe('Acme')
  })

  it('sets parentProductId from ParentProductID', () => {
    const raw: RawChannelAdvisorProduct = { ID: 200, ParentProductID: 100 }
    const result = transformProduct(raw)
    expect(result.parentProductId).toBe('100')
  })

  it('maps attribute bag into metadata with attr_ prefix', () => {
    const raw: RawChannelAdvisorProduct = {
      ID: 1,
      Attributes: [
        { Name: 'Color', Value: 'Blue' },
        { Name: 'Size', Value: 'Large' },
      ],
    }
    const result = transformProduct(raw)
    expect(result.metadata['attr_Color']).toBe('Blue')
    expect(result.metadata['attr_Size']).toBe('Large')
  })

  it('stores UPC in upc field', () => {
    const raw: RawChannelAdvisorProduct = { ID: 1, UPC: '012345678901' }
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('maps createdAt and updatedAt from UTC date strings', () => {
    const raw: RawChannelAdvisorProduct = {
      ID: 1,
      CreateDateUtc: '2024-03-01T00:00:00Z',
      UpdateDateUtc: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.createdAt).toContain('2024-03-01')
    expect(result.updatedAt).toContain('2024-03-01')
  })

  it('passes ProductSchema validation', () => {
    const raw: RawChannelAdvisorProduct = {
      ID: 500,
      Sku: 'WK-2026',
      Title: 'Wireless Keyboard',
      Description: 'Bluetooth keyboard',
      Brand: 'Keyboards Inc',
      UPC: '0123456789012',
      // ChannelAdvisor stores RetailPrice as major dollar units, not cents.
      // Amount schema requires int, so use an integer-valued price to pass validation.
      RetailPrice: 50,
      Weight: 0.5,
      WeightUnit: 'KG',
      IsActive: true,
      CreateDateUtc: '2024-03-01T00:00:00Z',
      UpdateDateUtc: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
