import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSnipeItAsset,
} from '../../../../../../../src/verticals/inventory/adapters/snipe-it/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('snipe-it transformProduct', () => {
  const raw: RawSnipeItAsset = {
    id: 123,
    name: 'ThinkPad X1 Carbon',
    asset_tag: 'ASSET-0042',
    serial: 'SN-XYZ-9876',
    model: { id: 5, name: 'ThinkPad X1' },
    model_number: 'X1C9',
    status_label: {
      id: 2,
      name: 'Ready to Deploy',
      status_type: 'deployable',
      status_meta: 'deployable',
    },
    category: { id: 1, name: 'Laptops' },
    manufacturer: { id: 3, name: 'Lenovo' },
    supplier: { id: 8, name: 'Tech Supplies Ltd' },
    purchase_cost: '1299.99',
    notes: 'Assigned to engineering pool',
    created_at: { datetime: '2024-03-01T00:00:00Z', formatted: '2024-03-01' },
    updated_at: { datetime: '2024-03-01T00:00:00Z', formatted: '2024-03-01' },
  }

  it('maps id (numeric) as string, asset_tag as sku', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('123')
    expect(result.sku).toBe('ASSET-0042')
    expect(result.platform).toBe('snipe-it')
  })

  it('maps name field', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('ThinkPad X1 Carbon')
  })

  it('maps manufacturer.name to brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('Lenovo')
  })

  it('maps category.name to category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Laptops')
  })

  it('converts purchase_cost decimal string to integer cents for cost', () => {
    // "1299.99" → Math.round(1299.99 * 100) = 129999
    const result = transformProduct(raw)
    expect(result.cost?.amount).toBe(129999)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps supplier.id to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['8'])
  })

  it('sets isActive=true when status_meta is not "Archived"', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false when status_meta is "Archived"', () => {
    const result = transformProduct({
      ...raw,
      status_label: { id: 99, name: 'Archived', status_type: 'archived', status_meta: 'Archived' },
    })
    expect(result.isActive).toBe(false)
  })

  it('always sets unitOfMeasure to "each"', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps notes to description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Assigned to engineering pool')
  })

  it('maps SnipeDate created_at.datetime to createdAt ISO string', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output satisfying ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
