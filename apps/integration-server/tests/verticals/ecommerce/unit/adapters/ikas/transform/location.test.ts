import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawIkasStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawIkasStockLocation> = {}): RawIkasStockLocation {
  return {
    id: 'loc-001',
    name: 'Istanbul Warehouse',
    isActive: true,
    address: {
      addressLine1: 'Atatürk Cad. No:5',
      city: { name: 'İstanbul' },
      state: { name: 'İstanbul' },
      country: { name: 'Turkey', iso2: 'TR', code: 'TR' },
      postalCode: '34000',
    },
    phone: '+905551234567',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (ikas)', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('loc-001')
    expect(result.name).toBe('Istanbul Warehouse')
  })

  it('maps active from isActive', () => {
    const result = transformLocation(makeLocation())
    expect(result.active).toBe(true)
  })

  it('maps phone', () => {
    const result = transformLocation(makeLocation())
    expect(result.phone).toBe('+905551234567')
  })

  it('maps address fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.address?.line1).toBe('Atatürk Cad. No:5')
    expect(result.address?.city).toBe('İstanbul')
    expect(result.address?.postalCode).toBe('34000')
    expect(result.address?.country).toBe('TR')
  })

  it('sets isFulfillmentCenter true when isActive is not false', () => {
    const result = transformLocation(makeLocation())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('omits isFulfillmentCenter when isActive is false', () => {
    const result = transformLocation(makeLocation({ isActive: false }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('returns no address when all address fields are null/empty', () => {
    const result = transformLocation(
      makeLocation({
        address: {
          addressLine1: null,
          city: null,
          country: null,
          postalCode: null,
        },
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('returns no address when address is null', () => {
    const result = transformLocation(makeLocation({ address: null }))
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
