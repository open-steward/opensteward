import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawConnectposProduct,
} from '../../../../../../../src/verticals/inventory/adapters/connectpos/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('connectpos transformProduct', () => {
  it('maps entity_id to id and externalId', () => {
    const raw: RawConnectposProduct = {
      entity_id: 55,
      sku: 'PROD-001',
      name: 'Blue T-Shirt',
      status: 1,
    }
    const result = transformProduct(raw)

    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
    expect(result.sku).toBe('PROD-001')
    expect(result.name).toBe('Blue T-Shirt')
    expect(result.platform).toBe('connectpos')
  })

  it('maps Magento status 1 to isActive true', () => {
    const raw: RawConnectposProduct = { entity_id: 1, status: 1 }
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps Magento status 2 to isActive false', () => {
    const raw: RawConnectposProduct = { entity_id: 1, status: 2 }
    const result = transformProduct(raw)
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when status is absent', () => {
    const raw: RawConnectposProduct = { entity_id: 1 }
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('converts weight from kg to grams as integer', () => {
    const raw: RawConnectposProduct = { entity_id: 1, weight: 1.5 }
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(1500)
  })

  it('converts retail price from major units to minor units (cents)', () => {
    const raw: RawConnectposProduct = { entity_id: 1, price: 19.99 }
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(1999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('joins category_ids into a comma-separated string', () => {
    const raw: RawConnectposProduct = { entity_id: 1, category_ids: [3, 7, 12] }
    const result = transformProduct(raw)
    expect(result.category).toBe('3,7,12')
  })

  it('sets category to undefined when category_ids is empty', () => {
    const raw: RawConnectposProduct = { entity_id: 1, category_ids: [] }
    const result = transformProduct(raw)
    expect(result.category).toBeUndefined()
  })

  it('prefers description over short_description', () => {
    const raw: RawConnectposProduct = {
      entity_id: 1,
      description: 'Full description',
      short_description: 'Short desc',
    }
    const result = transformProduct(raw)
    expect(result.description).toBe('Full description')
  })

  it('falls back to short_description when description is absent', () => {
    const raw: RawConnectposProduct = {
      entity_id: 1,
      short_description: 'Short desc',
    }
    const result = transformProduct(raw)
    expect(result.description).toBe('Short desc')
  })

  it('prefers brand over manufacturer', () => {
    const raw: RawConnectposProduct = { entity_id: 1, brand: 'Nike', manufacturer: 'Acme' }
    const result = transformProduct(raw)
    expect(result.brand).toBe('Nike')
  })

  it('maps barcode to upc', () => {
    const raw: RawConnectposProduct = { entity_id: 1, barcode: '0123456789012' }
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('passes ProductSchema validation', () => {
    const raw: RawConnectposProduct = {
      entity_id: 200,
      sku: 'TEE-BLUE-M',
      name: 'Blue T-Shirt Medium',
      description: 'A comfortable blue cotton t-shirt',
      price: 24.99,
      status: 1,
      weight: 0.3,
      barcode: '9780000000001',
      brand: 'UrbanWear',
      category_ids: [5, 10],
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
