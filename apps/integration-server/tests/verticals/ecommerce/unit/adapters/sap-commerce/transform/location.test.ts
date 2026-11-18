import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSapPointOfService,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makePoS(overrides: Partial<RawSapPointOfService> = {}): RawSapPointOfService {
  return {
    name: 'store-munich',
    displayName: 'Munich Flagship Store',
    address: {
      line1: 'Marienplatz 1',
      town: 'Munich',
      region: { isocode: 'DE-BY', name: 'Bavaria' },
      postalCode: '80331',
      country: { isocode: 'DE', name: 'Germany' },
      phone: '+49 89 9876543',
    },
    warehouseCodes: ['warehouse-munich-01'],
    ...overrides,
  }
}

describe('transformLocation (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformLocation(makePoS())
    expect(r.id).toBe('store-munich')
    expect(r.name).toBe('Munich Flagship Store')
    expect(r.active).toBe(true)
  })

  it('maps address with region isocode', () => {
    const r = transformLocation(makePoS())
    expect(r.address?.line1).toBe('Marienplatz 1')
    expect(r.address?.city).toBe('Munich')
    expect(r.address?.region).toBe('DE-BY')
    expect(r.address?.country).toBe('DE')
  })

  it('maps phone from address', () => {
    const r = transformLocation(makePoS())
    expect(r.phone).toBe('+49 89 9876543')
  })

  it('sets isFulfillmentCenter when warehouseCodes exist', () => {
    const r = transformLocation(makePoS())
    expect(r.isFulfillmentCenter).toBe(true)
  })

  it('sets isFulfillmentCenter false when no warehouses', () => {
    const r = transformLocation(makePoS({ warehouseCodes: [] }))
    expect(r.isFulfillmentCenter).toBe(false)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePoS()
    const r = transformLocation(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const r = transformLocation(makePoS())
    expect(() => LocationSchema.parse(r)).not.toThrow()
  })
})
