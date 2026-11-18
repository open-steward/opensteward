import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawBoxstormPart,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('boxstorm transformProduct', () => {
  const raw: RawBoxstormPart = {
    id: 101,
    number: 'WDG-001',
    description: 'Widget Alpha',
    details: 'A detailed description of Widget Alpha',
    upc: '012345678901',
    type: 'Inventory',
    abc: 'A',
    hasBom: false,
    tracksSerialNumbers: false,
    hasTracking: false,
    active: true,
    uom: { id: 1, name: 'each', abbreviation: 'each' },
    productNumber: 'P-001',
    vendorPartNumber: 'VPN-001',
    dateCreated: '2024-03-01T00:00:00Z',
    dateLastModified: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId as string from numeric id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps sku from number field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WDG-001')
  })

  it('maps name from description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Widget Alpha')
  })

  it('maps description from details', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('A detailed description of Widget Alpha')
  })

  it('maps upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('maps unitOfMeasure from uom abbreviation', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps unitOfMeasure from uom name when abbreviation absent', () => {
    const result = transformProduct({ ...raw, uom: { id: 1, name: 'each' } })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets isActive true when active is true', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt from dateCreated', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from dateLastModified', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to boxstorm', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
