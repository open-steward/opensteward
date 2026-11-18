import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawVarioArticle,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const baseRaw: RawVarioArticle = {
  id: 'art-001',
  number: 'WK-2026',
  name: 'Wireless Keyboard',
  description: 'Bluetooth wireless keyboard',
  active: true,
  productType: 'WITH_STOCK',
  deliverable: true,
  netSalesPrice: 29.99,
  productUnit: { id: 'u1', displayName: 'each' },
  grossMetric: { weight: 0.45, sizeX: 44, sizeY: 13, sizeZ: 3 },
  identifiers: [{ name: 'EAN', value: '0123456789012', defaultArticleIdentifier: true }],
  manufacturerRef: { id: 'm1', displayName: 'Keyboards Inc' },
  productGroupRef: { id: 'g1', displayName: 'Peripherals' },
  countryOfOriginRef: { id: 'c1', displayName: 'Germany' },
  customsTariffNumber: '84716090',
  version: '1',
  info: { createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z' },
}

describe('vario-software transformProduct', () => {
  it('maps sku from number', () => {
    const result = transformProduct(baseRaw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from name field', () => {
    const result = transformProduct(baseRaw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps upc from EAN identifier', () => {
    const result = transformProduct(baseRaw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand from manufacturerRef.displayName', () => {
    const result = transformProduct(baseRaw)
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('maps category from productGroupRef.displayName', () => {
    const result = transformProduct(baseRaw)
    expect(result.category).toBe('Peripherals')
  })

  it('maps unitOfMeasure from productUnit.displayName', () => {
    const result = transformProduct(baseRaw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(baseRaw)
    expect(result.weightGrams).toBeCloseTo(450)
  })

  it('maps dimensionsCm from grossMetric sizeX/Y/Z', () => {
    const result = transformProduct(baseRaw)
    expect(result.dimensionsCm).toEqual({ length: 44, width: 13, height: 3 })
  })

  it('converts retailPrice to integer minor units in EUR', () => {
    const result = transformProduct(baseRaw)
    expect(result.retailPrice).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps isActive from active flag', () => {
    expect(transformProduct(baseRaw).isActive).toBe(true)
    expect(transformProduct({ ...baseRaw, active: false }).isActive).toBe(false)
  })

  it('maps createdAt and updatedAt from info', () => {
    const result = transformProduct(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to vario-software', () => {
    expect(transformProduct(baseRaw).platform).toBe('vario-software')
  })

  it('defaults unitOfMeasure to each when productUnit absent', () => {
    const result = transformProduct({ ...baseRaw, productUnit: undefined })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(baseRaw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
