import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawMintsoftProduct,
} from '../../../../../../../src/verticals/inventory/adapters/mintsoft/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('mintsoft transformProduct', () => {
  const raw: RawMintsoftProduct = {
    ID: 123,
    SKU: 'SKU-ABC',
    Name: 'Olive Oil 500ml',
    Description: 'Premium cold-pressed olive oil',
    EAN: '5901234123457',
    Weight: 0.5,
    Height: 20,
    Width: 5,
    Depth: 5,
    Price: 9.99,
    DisCont: false,
    LastUpdated: '2024-03-01T00:00:00Z',
    ClientId: 10,
    WarehouseId: 7,
  }

  it('maps id and externalId from ID as string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('123')
    expect(result.externalId).toBe('123')
  })

  it('maps sku from SKU field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-ABC')
  })

  it('maps name from Name field', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Olive Oil 500ml')
  })

  it('maps description from Description field', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Premium cold-pressed olive oil')
  })

  it('maps upc from EAN field', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('5901234123457')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(500)
  })

  it('maps retailPrice in pence with GBP currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(999)
    expect(result.retailPrice?.currency).toBe('GBP')
  })

  it('sets isActive true when DisCont is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when DisCont is true', () => {
    const result = transformProduct({ ...raw, DisCont: true })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to mintsoft', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('mintsoft')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
