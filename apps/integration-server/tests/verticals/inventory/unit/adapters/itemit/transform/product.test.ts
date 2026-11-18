import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawItemitItem,
} from '../../../../../../../src/verticals/inventory/adapters/itemit/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — itemit item', () => {
  const raw: RawItemitItem = {
    id: 'item-abc-001',
    name: 'Laptop Model X',
    description: 'Company laptop for engineers',
    serial: 'SN-123456',
    type: 'Electronics',
    archived: false,
    createdAt: '2024-03-01T00:00:00Z',
    location: {
      id: 'loc-abc-001',
      name: 'Main Warehouse',
      type: 'warehouse',
    },
    workspace: 'ws-001',
  }
  const result = transformProduct(raw)

  it('sets id from id', () => {
    expect(result.id).toBe('item-abc-001')
  })

  it('sets sku from serial', () => {
    expect(result.sku).toBe('SN-123456')
  })

  it('sets name from name', () => {
    expect(result.name).toBe('Laptop Model X')
  })

  it('sets description from description', () => {
    expect(result.description).toBe('Company laptop for engineers')
  })

  it('sets unitOfMeasure to each (hardcoded)', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets isActive to true when archived is false', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets supplierIds to empty array', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('sets createdAt from createdAt', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to itemit', () => {
    expect(result.platform).toBe('itemit')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — archived item', () => {
  const raw: RawItemitItem = {
    id: 'item-archived-001',
    name: 'Old Laptop',
    archived: true,
    created: {
      at: { timestamp: '2024-03-01T00:00:00Z' },
      by: { id: 'user-1', name: 'Alice' },
    },
  }
  const result = transformProduct(raw)

  it('sets isActive to false when archived is true', () => {
    expect(result.isActive).toBe(false)
  })

  it('sku falls back to empty string when serial absent', () => {
    expect(result.sku).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
