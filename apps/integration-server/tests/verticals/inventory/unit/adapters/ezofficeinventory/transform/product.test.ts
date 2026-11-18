import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawEZOInventory,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — ezofficeinventory', () => {
  const raw: RawEZOInventory = {
    id: 101,
    name: 'Blue Pen',
    sequence_num: 'SKU-001',
    description: 'A blue ballpoint pen',
    identifier: '012345678901',
    group_name: 'Stationery',
    state: 'active',
    cost_price: '2.50',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('101')
  })

  it('maps sku from sequence_num', () => {
    expect(result.sku).toBe('SKU-001')
  })

  it('maps upc from identifier', () => {
    expect(result.upc).toBe('012345678901')
  })

  it('maps category from group_name', () => {
    expect(result.category).toBe('Stationery')
  })

  it('converts cost_price to integer minor units (* 100)', () => {
    expect(result.retailPrice?.amount).toBe(250)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive: true when state is "active"', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt from created_at', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ezofficeinventory', () => {
    expect(result.platform).toBe('ezofficeinventory')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — ezofficeinventory retired state', () => {
  const raw: RawEZOInventory = {
    id: 202,
    name: 'Old Widget',
    sequence_num: 'SKU-OLD',
    state: 'retired',
    purchased_on: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('maps isActive: false when state is "retired"', () => {
    expect(result.isActive).toBe(false)
  })

  it('falls back to purchased_on for createdAt when created_at absent', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
