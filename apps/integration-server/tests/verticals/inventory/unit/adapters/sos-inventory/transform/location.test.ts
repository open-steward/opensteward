import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSosInventoryLocation,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('sos-inventory transformLocation', () => {
  const raw: RawSosInventoryLocation = {
    id: 5,
    name: 'Seattle Fulfillment',
    binTracking: true,
    address: {
      line1: '123 Commerce Way',
      line2: 'Suite 100',
      line3: 'Building B',
      city: 'Seattle',
      stateProvince: 'WA',
      postalCode: '98101',
      country: 'US',
      phone: '+12065550100',
      email: 'warehouse@example.com',
      company: 'Acme Inc',
      contact: 'Bob Jones',
    },
  }

  it('maps id (numeric) as string and name', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('5')
    expect(result.name).toBe('Seattle Fulfillment')
    expect(result.platform).toBe('sos-inventory')
  })

  it('always sets type to "warehouse" and isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
    expect(result.isActive).toBe(true)
  })

  it('maps address line1 directly', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Commerce Way')
  })

  it('concatenates line2–line5 into address.line2 with comma separator', () => {
    const result = transformLocation(raw)
    // line2="Suite 100", line3="Building B", line4/5 absent → "Suite 100, Building B"
    expect(result.address?.line2).toBe('Suite 100, Building B')
  })

  it('maps stateProvince to region', () => {
    const result = transformLocation(raw)
    expect(result.address?.region).toBe('WA')
  })

  it('maps city, country, postalCode', () => {
    const result = transformLocation(raw)
    expect(result.address?.city).toBe('Seattle')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('98101')
  })

  it('stores binTracking in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata['binTracking']).toBe('true')
  })

  it('omits address when raw.address is absent', () => {
    const result = transformLocation({ id: 1, name: 'Bare' })
    expect(result.address).toBeUndefined()
  })

  it('never sets parentLocationId (flat hierarchy)', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBeUndefined()
  })

  it('produces output satisfying LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
