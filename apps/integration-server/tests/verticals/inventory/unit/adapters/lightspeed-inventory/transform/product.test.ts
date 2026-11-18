import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawLightspeedProduct,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('lightspeed-inventory transformProduct', () => {
  const raw: RawLightspeedProduct = {
    id: 'prod-001',
    handle: 'blue-widget',
    name: 'Blue Widget (Large)',
    base_name: 'Blue Widget',
    sku: 'BW-LG',
    active: true,
    description: 'A large blue widget',
    supply_price: 9.99,
    supplier_id: 'sup-123',
    brand_id: 'brand-456',
    brand_name: 'WidgetCo',
    tags: ['blue', 'widget'],
    categories: [{ id: 'cat-1', name: 'Widgets' }],
    tax_id: 'tax-789',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    version: 10,
  }

  it('maps id and externalId from id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-001')
    expect(result.externalId).toBe('prod-001')
  })

  it('maps sku from sku field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('BW-LG')
  })

  it('maps name from name field', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue Widget (Large)')
  })

  it('maps brand from brand_name', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('WidgetCo')
  })

  it('maps category from first categories entry', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Widgets')
  })

  it('includes supplier_id in supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('sup-123')
  })

  it('sets isActive from active flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when deleted_at is set and active is undefined', () => {
    const result = transformProduct({
      ...raw,
      active: undefined,
      deleted_at: '2024-03-01T00:00:00Z',
    })
    expect(result.isActive).toBe(false)
  })

  it('omits retailPrice (no currency at product level)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toBeUndefined()
  })

  it('maps createdAt to ISO string', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
