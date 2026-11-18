import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawAdvanceProWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const rawWarehouse: RawAdvanceProWarehouse = {
  id: '5',
  name: 'Main Warehouse',
  code: 'MAIN',
  isActive: true,
  address1: '123 Main St',
  city: 'Portland',
  state: 'OR',
  country: 'US',
  postalCode: '97201',
}

describe('transformLocation', () => {
  it('maps id, name, and platform', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.id).toBe('5')
    expect(result.name).toBe('Main Warehouse')
    expect(result.platform).toBe('advance-pro')
  })

  it('maps type, code, and isActive', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.type).toBe('warehouse')
    expect(result.code).toBe('MAIN')
    expect(result.isActive).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.city).toBe('Portland')
    expect(result.address?.region).toBe('OR')
    expect(result.address?.postalCode).toBe('97201')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(rawWarehouse)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
