import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSnipeItLocation,
} from '../../../../../../../src/verticals/inventory/adapters/snipe-it/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('snipe-it transformLocation', () => {
  const raw: RawSnipeItLocation = {
    id: 7,
    name: 'Head Office',
    address: '10 Downing St',
    address2: 'Floor 2',
    city: 'London',
    state: 'England',
    country: 'GB',
    zip: 'SW1A 2AA',
    phone: '+441234567890',
    assets_count: 42,
    assigned_assets_count: 10,
    users_count: 5,
  }

  it('maps id (numeric) as string and name', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('7')
    expect(result.name).toBe('Head Office')
    expect(result.platform).toBe('snipe-it')
  })

  it('always sets type to "warehouse"', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('always sets isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('10 Downing St')
    expect(result.address?.line2).toBe('Floor 2')
    expect(result.address?.city).toBe('London')
    expect(result.address?.region).toBe('England')
    expect(result.address?.country).toBe('GB')
    expect(result.address?.postalCode).toBe('SW1A 2AA')
  })

  it('maps parent.id to parentLocationId', () => {
    const result = transformLocation({ ...raw, parent: { id: 3, name: 'Region North' } })
    expect(result.parentLocationId).toBe('3')
  })

  it('omits address when no address fields present', () => {
    const result = transformLocation({ id: 1, name: 'Empty' })
    expect(result.address).toBeUndefined()
  })

  it('stores asset counts and phone in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata['assetsCount']).toBe('42')
    expect(result.metadata['phone']).toBe('+441234567890')
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
