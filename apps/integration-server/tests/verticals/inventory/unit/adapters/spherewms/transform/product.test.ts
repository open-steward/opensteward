import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSphereWmsProduct,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — spherewms', () => {
  const raw: RawSphereWmsProduct = {
    uid_no: 'PROD-42',
    product_code: 'WK-2026',
    description_1: 'Wireless Keyboard',
    description_2: 'Bluetooth compact keyboard',
    upc_code: '0123456789012',
    product_line: 'Peripherals',
    client_code: 'CLIENT-1',
    serial_no_flag: false,
    lot_no_flag: false,
    created_on: '2024-03-01T00:00:00Z',
    updated_on: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('maps id from uid_no as string', () => {
    expect(result.id).toBe('PROD-42')
  })

  it('maps sku from product_code', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from description_1', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps description from description_2', () => {
    expect(result.description).toBe('Bluetooth compact keyboard')
  })

  it('maps upc from upc_code', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from product_line', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('sets unitOfMeasure to each', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps createdAt from created_on', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from updated_on', () => {
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('supplies empty supplierIds array', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('stores clientCode in metadata', () => {
    expect(result.metadata['clientCode']).toBe('CLIENT-1')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — spherewms numeric uid_no', () => {
  const raw: RawSphereWmsProduct = { uid_no: 999 }
  const result = transformProduct(raw)

  it('coerces numeric uid_no to string id', () => {
    expect(result.id).toBe('999')
  })

  it('falls back sku to empty string when no product_code', () => {
    expect(result.sku).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
