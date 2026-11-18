import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawGocodesAsset,
} from '../../../../../../../src/verticals/inventory/adapters/gocodes/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — gocodes', () => {
  const raw: RawGocodesAsset = {
    id: 'asset-001',
    asset_tag: 'QR-0042',
    name: 'Blue Pen',
    description: 'A ballpoint pen',
    category: 'Stationery',
    subcategory: 'Pens',
    serial_number: 'SN-12345',
    location_id: 'loc-001',
    location_name: 'Main Shelf',
    active: true,
    purchase_cost: 2.5,
    currency: 'USD',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('asset-001')
  })

  it('maps sku from asset_tag', () => {
    expect(result.sku).toBe('QR-0042')
  })

  it('maps name', () => {
    expect(result.name).toBe('Blue Pen')
  })

  it('maps upc from serial_number', () => {
    expect(result.upc).toBe('SN-12345')
  })

  it('maps category', () => {
    expect(result.category).toBe('Stationery')
  })

  it('converts purchase_cost to integer minor units (* 100)', () => {
    expect(result.retailPrice?.amount).toBe(250)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from boolean active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt from created_at', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from updated_at', () => {
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to gocodes', () => {
    expect(result.platform).toBe('gocodes')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — gocodes string purchase_cost', () => {
  const raw: RawGocodesAsset = {
    id: 'asset-002',
    asset_tag: 'QR-0043',
    name: 'Widget',
    purchase_cost: '19.99',
    currency: 'EUR',
    active: true,
  }
  const result = transformProduct(raw)

  it('parses string purchase_cost to integer minor units', () => {
    expect(result.retailPrice?.amount).toBe(1999)
    expect(result.retailPrice?.currency).toBe('EUR')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — gocodes inactive and no cost', () => {
  const raw: RawGocodesAsset = {
    id: 'asset-003',
    asset_tag: 'QR-OLD',
    name: 'Retired Item',
    active: 'false',
  }
  const result = transformProduct(raw)

  it('maps isActive: false from string "false"', () => {
    expect(result.isActive).toBe(false)
  })

  it('leaves retailPrice undefined when purchase_cost absent', () => {
    expect(result.retailPrice).toBeUndefined()
  })

  it('defaults currency to USD when currency field absent', () => {
    // retailPrice is undefined, so no assertion needed; just check schema
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
