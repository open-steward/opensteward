import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawMabangProduct,
} from '../../../../../../../src/verticals/inventory/adapters/mabang-erp/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('mabang-erp transformProduct', () => {
  const raw: RawMabangProduct = {
    stockId: '12345',
    stockSku: 'MB-SKU-001',
    nameCN: '蓝色小部件',
    nameEN: 'Blue Widget',
    status: '1',
    weight: '0.5',
    declareCode: '8543709990',
    warehouseName: 'Main Warehouse',
    warehouseCode: 'WH-01',
    providerName: 'Acme Co',
    providerId: '999',
    salesSku: 'PARENT-SKU',
    labelId: '77',
    timeCreated: '2024-03-01T00:00:00Z',
    timeUpdated: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from stockId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('12345')
    expect(result.externalId).toBe('12345')
  })

  it('maps sku from stockSku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('MB-SKU-001')
  })

  it('maps name from nameEN', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue Widget')
  })

  it('falls back to nameCN when nameEN is absent', () => {
    const result = transformProduct({ ...raw, nameEN: undefined })
    expect(result.name).toBe('蓝色小部件')
  })

  it('maps upc from declareCode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('8543709990')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBeCloseTo(500)
  })

  it('sets isActive true when status is 1', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is 2', () => {
    const result = transformProduct({ ...raw, status: '2' })
    expect(result.isActive).toBe(false)
  })

  it('maps parentProductId from salesSku', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBe('PARENT-SKU')
  })

  it('maps supplierIds from providerId', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['999'])
  })

  it('maps createdAt to ISO string', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to mabang-erp', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('mabang-erp')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
