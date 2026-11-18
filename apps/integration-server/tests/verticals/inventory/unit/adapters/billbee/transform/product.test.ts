import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawBillbeeProduct,
} from '../../../../../../../src/verticals/inventory/adapters/billbee/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('billbee transformProduct', () => {
  const raw: RawBillbeeProduct = {
    Id: 12345,
    SKU: 'BB-SKU-001',
    EAN: '9780000000000',
    Title: [{ LanguageCode: 'DE', Text: 'Testprodukt' }],
    Description: [{ LanguageCode: 'DE', Text: 'Eine ausführliche Beschreibung' }],
    ShortDescription: [{ LanguageCode: 'DE', Text: 'Kurz' }],
    Price: 20,
    CostPrice: 10,
    Weight: 450,
    LengthCm: 44,
    WidthCm: 13,
    HeightCm: 3,
    IsDeactivated: false,
    Manufacturer: 'Keyboards Inc',
    Category1: { Id: 1, Name: 'Peripherals' },
    Category2: { Id: 2, Name: 'Keyboards' },
    StockCurrent: 100,
    VatIndex: 1,
    Type: 1,
  }

  it('maps id as string from Id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('12345')
    expect(result.externalId).toBe('12345')
  })

  it('maps sku from SKU', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('BB-SKU-001')
  })

  it('maps upc from EAN', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('9780000000000')
  })

  it('maps name from Title multilingual array', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Testprodukt')
  })

  it('maps brand from Manufacturer', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('maps category from Category1 and Category2 names joined', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals > Keyboards')
  })

  it('maps weightGrams from Weight (already in grams)', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450)
  })

  it('maps dimensionsCm from LengthCm/WidthCm/HeightCm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(44)
    expect(result.dimensionsCm?.width).toBe(13)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('maps retailPrice with EUR currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(20)
    expect(result.retailPrice?.currency).toBe('EUR')
  })

  it('sets isActive from IsDeactivated flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when IsDeactivated is true', () => {
    const result = transformProduct({ ...raw, IsDeactivated: true })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to billbee', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('billbee')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
