import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawCamelot3plLocation,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('camelot-3pl transformLocation', () => {
  const raw: RawCamelot3plLocation = {
    warehouseId: 'wh-001',
    warehouseName: 'Main Warehouse',
    warehouseCode: 'MW1',
    isActive: true,
    address1: '123 Logistics Blvd',
    address2: 'Suite 100',
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    postalCode: '60601',
  }

  it('maps id and externalId from warehouseId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('wh-001')
    expect(result.externalId).toBe('wh-001')
  })

  it('maps name from warehouseName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from warehouseCode', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('MW1')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Logistics Blvd')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.region).toBe('IL')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('60601')
  })

  it('sets address undefined when no address fields provided', () => {
    const result = transformLocation({ warehouseId: 'wh-002', warehouseName: 'Empty WH' })
    expect(result.address).toBeUndefined()
  })

  it('sets isActive from boolean isActive', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when isActive is false', () => {
    const result = transformLocation({ ...raw, isActive: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when not provided', () => {
    const result = transformLocation({ warehouseId: 'wh-003' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
