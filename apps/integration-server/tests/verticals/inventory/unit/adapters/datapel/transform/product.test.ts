import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawDatapelProduct,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('datapel transformProduct', () => {
  const raw: RawDatapelProduct = {
    basestockid: 101,
    itemcode: 'WIDGET-001',
    itemname: 'Blue Widget',
    notes: 'High-quality blue widget',
    isactive: true,
    price: 29.99,
    sellingunitofmeasure: 'each',
    buyingunitofmeasure: 'box',
    primarysuppliercardid: 55,
    customfield1: 'tag-a',
    timeStamp: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from basestockid', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps sku from itemcode', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WIDGET-001')
  })

  it('maps name from itemname', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue Widget')
  })

  it('maps description from notes', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('High-quality blue widget')
  })

  it('converts retailPrice to cents in AUD', () => {
    const result = transformProduct(raw)
    // 29.99 * 100 = 2999
    expect(result.retailPrice).toEqual({ amount: 2999, currency: 'AUD' })
  })

  it('prefers sellingunitofmeasure over buyingunitofmeasure', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('falls back to buyingunitofmeasure when sellingunitofmeasure absent', () => {
    const result = transformProduct({ ...raw, sellingunitofmeasure: undefined })
    expect(result.unitOfMeasure).toBe('box')
  })

  it('maps supplierIds from primarysuppliercardid', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['55'])
  })

  it('maps isActive from isactive flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when isactive is false', () => {
    const result = transformProduct({ ...raw, isactive: false })
    expect(result.isActive).toBe(false)
  })

  it('maps updatedAt from timeStamp', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to datapel', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
