import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawDaVinciUnifiedLocation,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('da-vinci-unified transformLocation', () => {
  const raw: RawDaVinciUnifiedLocation = {
    warehouseId: 'wh-001',
    warehouseName: 'Main Warehouse',
    warehouseCode: 'MW01',
    isActive: true,
    isDefault: false,
    address1: '100 Industrial Blvd',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    postalCode: '78701',
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
    expect(result.code).toBe('MW01')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields when address data is present', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Industrial Blvd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('leaves address undefined when no address fields provided', () => {
    const result = transformLocation({ warehouseId: 'wh-002' })
    expect(result.address).toBeUndefined()
  })

  it('respects isActive flag', () => {
    const result = transformLocation({ ...raw, isActive: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when absent', () => {
    const result = transformLocation({ warehouseId: 'wh-003' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
