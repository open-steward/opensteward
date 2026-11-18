import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  buildActionsForLocation,
  type RawCtChannel,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeChannel(overrides: Partial<RawCtChannel> = {}): RawCtChannel {
  return {
    id: 'chan-1',
    version: 1,
    key: 'warehouse-1',
    roles: ['InventorySupply'],
    name: { 'en-US': 'Main Warehouse', 'de-DE': 'Hauptlager' },
    address: {
      streetName: 'Distribution Ave',
      streetNumber: '5',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    },
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (commercetools)', () => {
  it('flattens name using the primary locale', () => {
    const r = transformLocation(makeChannel())
    expect(r.name).toBe('Main Warehouse')
  })

  it('falls back to key when name map is missing', () => {
    const r = transformLocation(makeChannel({ name: undefined }))
    expect(r.name).toBe('warehouse-1')
  })

  it('builds address with joined streetName + streetNumber', () => {
    const r = transformLocation(makeChannel())
    expect(r.address?.line1).toBe('Distribution Ave 5')
    expect(r.address?.country).toBe('DE')
  })

  it('marks InventorySupply channels as fulfillment centers', () => {
    const r = transformLocation(makeChannel())
    expect(r.isFulfillmentCenter).toBe(true)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const r = transformLocation(makeChannel())
    expect(() => LocationSchema.parse(r)).not.toThrow()
  })

  it('round-trips writable fields via untransformLocation', () => {
    const canonical = transformLocation(makeChannel())
    const raw = untransformLocation(canonical) as Record<string, unknown>
    const name = raw['name'] as Record<string, string>
    expect(name['en-US']).toBe('Main Warehouse')
    expect(raw['roles']).toEqual(['InventorySupply'])
    const address = raw['address'] as { streetName: string; country: string }
    expect(address.streetName).toBe('Distribution Ave 5')
    expect(address.country).toBe('DE')
  })

  it('builds update actions from a partial patch', () => {
    const actions = buildActionsForLocation(makeChannel(), {
      name: 'East Warehouse',
    })
    expect(actions[0]).toEqual({
      action: 'changeName',
      name: { 'en-US': 'East Warehouse' },
    })
  })
})
