import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSapEwmProduct,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('sap-ewm transformProduct', () => {
  const raw: RawSapEwmProduct = {
    Product: 'MAT-001',
    ProductDescription: 'Wireless Keyboard',
    ProductType: 'FERT',
    BaseUnit: 'EA',
    GrossWeight: '0.45',
    WeightUnit: 'KG',
    Length: '0.44',
    Width: '0.13',
    Height: '0.03',
    SizeUnit: 'M',
    MaterialGroup: 'PERIPHERALS',
    ProductStandardID: '0123456789012',
    DeletionIndicator: false,
    CrossPlantStatus: '',
    CreationDate: '2024-03-01T00:00:00Z',
    LastChangeDate: '2024-03-01T00:00:00Z',
  }

  it('maps id and sku from Product', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('MAT-001')
    expect(result.sku).toBe('MAT-001')
  })

  it('maps name from ProductDescription', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('converts KG weight to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450) // 0.45 kg × 1000
  })

  it('converts LB weight to grams', () => {
    const result = transformProduct({ ...raw, GrossWeight: 1, WeightUnit: 'LB' })
    expect(result.weightGrams).toBeCloseTo(453.592, 0)
  })

  it('maps upc from ProductStandardID', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from MaterialGroup', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('PERIPHERALS')
  })

  it('converts dimensions from M to CM', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(44, 1) // 0.44 m × 100
    expect(result.dimensionsCm?.width).toBeCloseTo(13, 1)
    expect(result.dimensionsCm?.height).toBeCloseTo(3, 1)
  })

  it('isActive true when DeletionIndicator false and CrossPlantStatus not KO', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('isActive false when DeletionIndicator is true', () => {
    const result = transformProduct({ ...raw, DeletionIndicator: true })
    expect(result.isActive).toBe(false)
  })

  it('isActive false when CrossPlantStatus is KO', () => {
    const result = transformProduct({ ...raw, CrossPlantStatus: 'KO' })
    expect(result.isActive).toBe(false)
  })

  it('platform is sap-ewm', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('maps BaseUnit EA to canonical each', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('leaves unitOfMeasure undefined for an unmapped BaseUnit code', () => {
    const result = transformProduct({ ...raw, BaseUnit: 'PC' })
    expect(result.unitOfMeasure).toBeUndefined()
  })

  it('leaves unitOfMeasure undefined when BaseUnit is absent', () => {
    const result = transformProduct({ ...raw, BaseUnit: undefined })
    expect(result.unitOfMeasure).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
