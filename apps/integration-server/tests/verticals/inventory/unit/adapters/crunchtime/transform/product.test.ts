import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawCrunchtimeProduct,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('crunchtime transformProduct', () => {
  it('uses productNumber as id, externalId, and sku', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-100',
      productName: 'Burger Buns',
      activeFlag: true,
    }
    const result = transformProduct(raw)

    expect(result.id).toBe('PN-100')
    expect(result.externalId).toBe('PN-100')
    expect(result.sku).toBe('PN-100')
  })

  it('maps productName to name', () => {
    const raw: RawCrunchtimeProduct = { productNumber: 'PN-101', productName: 'Ketchup Packets' }
    const result = transformProduct(raw)
    expect(result.name).toBe('Ketchup Packets')
  })

  it('maps productDescription to description', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-102',
      productDescription: 'Portion-control ketchup',
    }
    const result = transformProduct(raw)
    expect(result.description).toBe('Portion-control ketchup')
  })

  it('maps universalProductCode to upc', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-103',
      universalProductCode: '024000320319',
    }
    const result = transformProduct(raw)
    expect(result.upc).toBe('024000320319')
  })

  it('maps category field', () => {
    const raw: RawCrunchtimeProduct = { productNumber: 'PN-104', category: 'Dry Goods' }
    const result = transformProduct(raw)
    expect(result.category).toBe('Dry Goods')
  })

  it('maps defaultVendorCode to supplierIds array', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-105',
      defaultVendorCode: 'VEN-001',
    }
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['VEN-001'])
  })

  it('sets supplierIds to empty array when defaultVendorCode is absent', () => {
    const raw: RawCrunchtimeProduct = { productNumber: 'PN-106' }
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual([])
  })

  it('uses provided unitOfMeasure when it is a recognised value', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-107',
      unitOfMeasure: 'kg',
    }
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('kg')
  })

  it('defaults unitOfMeasure to each when absent', () => {
    const raw: RawCrunchtimeProduct = { productNumber: 'PN-108' }
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps boolean activeFlag to isActive', () => {
    const rawActive: RawCrunchtimeProduct = { productNumber: 'PN-109', activeFlag: true }
    const rawInactive: RawCrunchtimeProduct = { productNumber: 'PN-110', activeFlag: false }
    expect(transformProduct(rawActive).isActive).toBe(true)
    expect(transformProduct(rawInactive).isActive).toBe(false)
  })

  it('stores subCategory, microCategory, concept in metadata', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-111',
      subCategory: 'Condiments',
      microCategory: 'Packets',
      concept: 'Burger Joint',
    }
    const result = transformProduct(raw)
    expect(result.metadata['subCategory']).toBe('Condiments')
    expect(result.metadata['microCategory']).toBe('Packets')
    expect(result.metadata['concept']).toBe('Burger Joint')
  })

  it('maps createdAt and updatedAt', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-112',
      createDate: '2024-03-01T00:00:00Z',
      lastEditDate: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.createdAt).toContain('2024-03-01')
    expect(result.updatedAt).toContain('2024-03-01')
  })

  it('passes ProductSchema validation', () => {
    const raw: RawCrunchtimeProduct = {
      productNumber: 'PN-FULL',
      productName: 'Classic Burger Bun',
      productDescription: '4-inch sesame seed bun',
      universalProductCode: '012345678901',
      category: 'Breads',
      subCategory: 'Buns',
      microCategory: 'Sesame',
      concept: 'Classic Burger',
      activeFlag: true,
      defaultVendorCode: 'VEN-BREAD',
      unitOfMeasure: 'each',
      createDate: '2024-03-01T00:00:00Z',
      lastEditDate: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
