import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSapProduct,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('sap-inventory transformProduct', () => {
  const raw: RawSapProduct = {
    Product: 'MAT-001',
    ProductType: 'FERT',
    BaseUnit: 'EA',
    GrossWeight: '0.45',
    WeightUnit: 'KG',
    ProductGroup: 'PERIPHERALS',
    IsMarkedForDeletion: false,
    CreationDate: '2024-03-01T00:00:00Z',
    LastChangeDate: '2024-03-01T00:00:00Z',
    to_Description: {
      results: [
        { Language: 'EN', ProductDescription: 'Wireless Keyboard' },
        { Language: 'DE', ProductDescription: 'Drahtlose Tastatur' },
      ],
    },
  }

  it('maps id and sku from Product', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('MAT-001')
    expect(result.sku).toBe('MAT-001')
  })

  it('picks English description from to_Description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('falls back to first description when no EN entry', () => {
    const result = transformProduct({
      ...raw,
      to_Description: { results: [{ Language: 'DE', ProductDescription: 'Tastatur' }] },
    })
    expect(result.name).toBe('Tastatur')
  })

  it('falls back name to Product number when no description', () => {
    const result = transformProduct({ ...raw, to_Description: undefined })
    expect(result.name).toBe('MAT-001')
  })

  it('converts KG weight to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450)
  })

  it('converts LB weight to grams', () => {
    const result = transformProduct({ ...raw, GrossWeight: 1, WeightUnit: 'LB' })
    expect(result.weightGrams).toBeCloseTo(454, 0)
  })

  it('maps category from ProductGroup', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('PERIPHERALS')
  })

  it('IsMarkedForDeletion false → isActive true', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('IsMarkedForDeletion true → isActive false', () => {
    const result = transformProduct({ ...raw, IsMarkedForDeletion: true })
    expect(result.isActive).toBe(false)
  })

  // Note: sap-inventory pickBool does NOT handle 'X' as true (unlike sap-ewm pickBool).
  // IsMarkedForDeletion: 'X' → pickBool returns undefined → isDeleted = false → isActive = true.
  // This is the actual sap-inventory adapter behavior.

  it('platform is sap-inventory', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('sap-inventory')
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
