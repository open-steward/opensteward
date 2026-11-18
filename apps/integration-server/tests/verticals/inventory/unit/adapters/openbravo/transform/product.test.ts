import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawOpenbravoProduct,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('openbravo transformProduct', () => {
  const raw: RawOpenbravoProduct = {
    id: 'prod-uuid-001',
    searchKey: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth wireless keyboard',
    uPC: '0123456789012',
    productCategory: { id: 'cat-001', _identifier: 'Peripherals' },
    uOM: { id: 'uom-001', _identifier: 'each' },
    productType: 'I',
    weight: 0.45,
    active: true,
    creationDate: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
    productPOList: [{ businessPartner: { id: 'bp-001' } }],
  }

  it('maps id and externalId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-uuid-001')
    expect(result.externalId).toBe('prod-uuid-001')
  })

  it('maps sku from searchKey', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps upc from uPC', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from productCategory._identifier', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('maps unitOfMeasure from uOM._identifier', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450)
  })

  it('maps isActive from active boolean', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps supplierIds from productPOList businessPartner IDs', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('bp-001')
  })

  it('maps createdAt from creationDate', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openbravo', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
