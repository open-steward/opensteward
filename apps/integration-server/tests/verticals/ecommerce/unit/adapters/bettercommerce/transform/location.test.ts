import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawBCStore,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeStore(overrides: Partial<RawBCStore> = {}): RawBCStore {
  return {
    storeId: 'store-001',
    storeName: 'London Warehouse',
    isActive: true,
    address1: '1 Fulfilment Road',
    address2: 'Unit B',
    city: 'London',
    state: 'England',
    postCode: 'EC1A 1BB',
    countryCode: 'GB',
    phone: '+44-20-7946-0001',
    isWarehouse: true,
    ...overrides,
  }
}

describe('transformLocation (BetterCommerce)', () => {
  it('maps storeId to id', () => {
    const result = transformLocation(makeStore({ storeId: 'store-001' }))
    expect(result.id).toBe('store-001')
  })

  it('falls back to recordId', () => {
    const result = transformLocation(makeStore({ storeId: undefined, recordId: 'rec-abc' }))
    expect(result.id).toBe('rec-abc')
  })

  it('maps storeName to name', () => {
    const result = transformLocation(makeStore())
    expect(result.name).toBe('London Warehouse')
  })

  it('falls back to name field', () => {
    const result = transformLocation(makeStore({ storeName: undefined, name: 'Alt Name' }))
    expect(result.name).toBe('Alt Name')
  })

  it('maps isActive to active', () => {
    const result = transformLocation(makeStore({ isActive: true }))
    expect(result.active).toBe(true)
  })

  it('falls back to active field', () => {
    const result = transformLocation(makeStore({ isActive: undefined, active: false }))
    expect(result.active).toBe(false)
  })

  it('maps address', () => {
    const result = transformLocation(makeStore())
    expect(result.address?.line1).toBe('1 Fulfilment Road')
    expect(result.address?.city).toBe('London')
    expect(result.address?.country).toBe('GB')
  })

  it('maps phone', () => {
    const result = transformLocation(makeStore())
    expect(result.phone).toBe('+44-20-7946-0001')
  })

  it('falls back to phoneNo', () => {
    const result = transformLocation(makeStore({ phone: undefined, phoneNo: '02079460002' }))
    expect(result.phone).toBe('02079460002')
  })

  it('marks warehouse locations as fulfillment centers', () => {
    const result = transformLocation(makeStore({ isWarehouse: true, isActive: true }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark inactive location as fulfillment center', () => {
    const result = transformLocation(makeStore({ isActive: false }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeStore()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = transformLocation(makeStore())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
