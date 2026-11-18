import { describe, it, expect } from 'vitest'
import { transformProduct } from '../../../../../../../src/verticals/inventory/adapters/pickware/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — pickware article', () => {
  const raw = {
    id: 42,
    name: 'Wireless Keyboard',
    description: 'Bluetooth wireless keyboard',
    taxId: 1,
    supplierId: 10,
    supplierName: 'Keyboards Inc',
    active: true,
    lastStock: false,
    mainDetail: {
      id: 84,
      number: 'WK-2026',
      ean: '0123456789012',
      weight: 0.45,
      width: 13,
      height: 3,
      len: 44,
      active: true,
      inStock: 100,
    },
    added: '2024-03-01T00:00:00Z',
    changed: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('sets id from raw.id as string', () => {
    expect(result.id).toBe('42')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('42')
  })

  it('sets sku from mainDetail.number', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('sets description', () => {
    expect(result.description).toBe('Bluetooth wireless keyboard')
  })

  it('sets upc from mainDetail.ean', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('sets unitOfMeasure to each', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight from kg to grams (0.45 kg = 450 g)', () => {
    expect(result.weightGrams).toBeCloseTo(450)
  })

  it('sets dimensionsCm from mainDetail', () => {
    expect(result.dimensionsCm).toEqual({ length: 44, width: 13, height: 3 })
  })

  it('sets isActive from raw.active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets supplierIds from raw.supplierId', () => {
    expect(result.supplierIds).toEqual(['10'])
  })

  it('sets createdAt and updatedAt as ISO strings', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to pickware', () => {
    expect(result.platform).toBe('pickware')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — no mainDetail', () => {
  const result = transformProduct({ id: 1, name: 'Basic Product' })

  it('sets sku to empty string when mainDetail absent', () => {
    expect(result.sku).toBe('')
  })

  it('leaves weightGrams undefined when mainDetail absent', () => {
    expect(result.weightGrams).toBeUndefined()
  })

  it('leaves dimensionsCm undefined when mainDetail absent', () => {
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('defaults isActive to true when active is undefined', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets supplierIds to empty array when supplierId absent', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
