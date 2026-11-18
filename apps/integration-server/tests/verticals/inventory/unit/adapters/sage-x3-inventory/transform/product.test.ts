import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSageX3Product,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('sage-x3-inventory transformProduct', () => {
  const raw: RawSageX3Product = {
    ITMREF: 'WK-2026',
    ITMDES1: 'Wireless Keyboard',
    ITMDES2: 'US Layout',
    TCLCOD: 'PERIPHERALS',
    ITMSTA: '1',
    STU: 'each',
    ITMWEI: 0.45,
    EANCOD: '0123456789012',
    BPSNUM: 'SUP001',
    BRDCOD: 'KeyBrands',
    CREDAT: '2024-03-01T00:00:00Z',
    UPDDAT: '2024-03-01T00:00:00Z',
  }

  it('maps id and sku from ITMREF', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('WK-2026')
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from ITMDES1', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('joins ITMDES1 and ITMDES2 into description when both present', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Wireless Keyboard\nUS Layout')
  })

  it('converts ITMWEI kg to weightGrams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450) // 0.45 kg × 1000
  })

  it('maps upc from EANCOD', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from TCLCOD', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('PERIPHERALS')
  })

  it('maps brand from BRDCOD', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('KeyBrands')
  })

  it('maps supplierIds from BPSNUM', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['SUP001'])
  })

  it('ITMSTA "1" → isActive true', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('ITMSTA "2" → isActive false', () => {
    const result = transformProduct({ ...raw, ITMSTA: '2' })
    expect(result.isActive).toBe(false)
  })

  it('ITMSTA "3" (obsolete) → isActive false', () => {
    const result = transformProduct({ ...raw, ITMSTA: '3' })
    expect(result.isActive).toBe(false)
  })

  it('platform is sage-x3-inventory', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('produces output satisfying ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
