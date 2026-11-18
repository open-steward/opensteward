import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawBooqableProductGroup,
} from '../../../../../../../src/verticals/inventory/adapters/booqable/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('booqable transformProduct', () => {
  const raw: RawBooqableProductGroup = {
    id: 'pg-001',
    type: 'product_groups',
    attributes: {
      id: 'pg-001',
      name: 'Vintage Camera',
      sku: 'CAM-VTG-001',
      slug: 'vintage-camera',
      description: 'A classic vintage camera for rent',
      base_price_in_cents: 5000,
      price_type: 'flat_rate',
      price_period: 'day',
      trackable: true,
      has_variations: false,
      archived: false,
      stock_count: 3,
      products_count: 3,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id and externalId from resource id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('pg-001')
    expect(result.externalId).toBe('pg-001')
  })

  it('maps sku from attributes.sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('CAM-VTG-001')
  })

  it('maps name from attributes.name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Vintage Camera')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('A classic vintage camera for rent')
  })

  it('maps retailPrice from base_price_in_cents as integer minor units', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(5000)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('sets isActive to true when archived is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when archived is true', () => {
    const archived: RawBooqableProductGroup = {
      ...raw,
      attributes: { ...raw.attributes, archived: true },
    }
    const result = transformProduct(archived)
    expect(result.isActive).toBe(false)
  })

  it('sets unitOfMeasure to each', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets platform to booqable', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('booqable')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
