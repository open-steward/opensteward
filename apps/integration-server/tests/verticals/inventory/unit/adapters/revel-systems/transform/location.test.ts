import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawRevelEstablishment,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('revel-systems transformLocation', () => {
  const raw: RawRevelEstablishment = {
    id: 5,
    name: 'Downtown POS',
    address: '123 Market St',
    address2: 'Suite 4',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'US',
    phone: '+14155551234',
    active: true,
    timezone: 'America/Los_Angeles',
    is_default_establishment: true,
  }

  it('stringifies numeric id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('maps name and type to store', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Downtown POS')
    expect(result.type).toBe('store')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Market St')
    expect(result.address?.line2).toBe('Suite 4')
    expect(result.address?.city).toBe('San Francisco')
    expect(result.address?.region).toBe('CA')
    expect(result.address?.postalCode).toBe('94105')
    expect(result.address?.country).toBe('US')
  })

  it('maps isActive from active boolean', () => {
    expect(transformLocation({ ...raw, active: true }).isActive).toBe(true)
    expect(transformLocation({ ...raw, active: false }).isActive).toBe(false)
  })

  it('maps isActive from active string', () => {
    expect(transformLocation({ ...raw, active: 'true' }).isActive).toBe(true)
    expect(transformLocation({ ...raw, active: 'false' }).isActive).toBe(false)
  })

  it('defaults isActive to true when active is absent', () => {
    const result = transformLocation({ id: 6 })
    expect(result.isActive).toBe(true)
  })

  it('omits address when no address fields are present', () => {
    const result = transformLocation({ id: 7, name: 'Ghost Location' })
    expect(result.address).toBeUndefined()
  })

  it('stores phone and timezone in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata['phone']).toBe('+14155551234')
    expect(result.metadata['timezone']).toBe('America/Los_Angeles')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
