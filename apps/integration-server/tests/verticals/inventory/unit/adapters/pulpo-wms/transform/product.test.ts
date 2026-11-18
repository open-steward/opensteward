import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawPulpoWmsProduct,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('pulpo-wms transformProduct', () => {
  const raw: RawPulpoWmsProduct = {
    id: 'prod-001',
    sku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Compact BT keyboard',
    barcode: '0123456789012',
    barcode_type: 'EAN13',
    brand: 'Keyboards Inc',
    category: 'Peripherals',
    product_type: 'finished_good',
    weight: 0.45,
    weight_unit: 'kg',
    length: 44,
    width: 13,
    height: 3,
    dimension_unit: 'cm',
    sale_price: 2999,
    currency: 'USD',
    is_active: true,
    parent_id: undefined,
    supplier_id: 'sup-01',
    supplier_ids: ['sup-02'],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id, sku and name', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-001')
    expect(result.sku).toBe('WK-2026')
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('converts kg weight to grams', () => {
    const result = transformProduct(raw)
    // 0.45 kg * 1000 = 450 g
    expect(result.weightGrams).toBe(450)
  })

  it('passes through grams without conversion', () => {
    const result = transformProduct({ ...raw, weight: 450, weight_unit: 'g' })
    expect(result.weightGrams).toBe(450)
  })

  it('maps retailPrice with currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(2999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('defaults retailPrice currency to EUR when currency is absent', () => {
    const result = transformProduct({ ...raw, currency: undefined })
    expect(result.retailPrice?.currency).toBe('EUR')
  })

  it('deduplicates supplier_id into supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('sup-01')
    expect(result.supplierIds).toContain('sup-02')
    expect(result.supplierIds.length).toBe(2)
  })

  it('maps dimensionsCm when length/width/height present', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(44)
    expect(result.dimensionsCm?.width).toBe(13)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('omits dimensionsCm when all dimensions are absent', () => {
    const result = transformProduct({
      ...raw,
      length: undefined,
      width: undefined,
      height: undefined,
    })
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('maps unitOfMeasure to "each"', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
