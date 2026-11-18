import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawScapiStore,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeStore(overrides: Partial<RawScapiStore> = {}): RawScapiStore {
  return {
    id: 'store-london-1',
    name: 'London Flagship',
    address1: '1 Oxford Street',
    city: 'London',
    stateCode: 'ENG',
    postalCode: 'W1D 1AQ',
    countryCode: 'GB',
    phone: '+44 20 1234 5678',
    storeType: 'retail',
    enabled: true,
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeStore())
    expect(result.id).toBe('store-london-1')
    expect(result.name).toBe('London Flagship')
  })

  it('is active when enabled is true', () => {
    const result = transformLocation(makeStore())
    expect(result.active).toBe(true)
  })

  it('is not active when enabled is false', () => {
    const result = transformLocation(makeStore({ enabled: false }))
    expect(result.active).toBe(false)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeStore())
    expect(result.address?.line1).toBe('1 Oxford Street')
    expect(result.address?.city).toBe('London')
    expect(result.address?.country).toBe('GB')
    expect(result.address?.postalCode).toBe('W1D 1AQ')
  })

  it('maps phone', () => {
    const result = transformLocation(makeStore())
    expect(result.phone).toBe('+44 20 1234 5678')
  })

  it('marks warehouse store type as fulfillment center', () => {
    const result = transformLocation(makeStore({ storeType: 'warehouse' }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark retail stores as fulfillment centers', () => {
    const result = transformLocation(makeStore())
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStore()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeStore())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
