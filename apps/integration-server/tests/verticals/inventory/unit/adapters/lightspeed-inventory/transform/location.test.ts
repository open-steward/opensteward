import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawLightspeedOutlet,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('lightspeed-inventory transformLocation', () => {
  const raw: RawLightspeedOutlet = {
    id: 'outlet-001',
    name: 'Downtown Store',
    time_zone: 'America/New_York',
    currency: 'USD',
    currency_symbol: '$',
    default_tax_id: 'tax-abc',
    physical_address: {
      street_1: '123 Main St',
      street_2: 'Suite 4',
      city: 'New York',
      country_subdivision_name: 'NY',
      country_name: 'US',
      postcode: '10001',
    },
    deleted_at: null,
    version: 42,
  }

  it('maps id and externalId from id field', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('outlet-001')
    expect(result.externalId).toBe('outlet-001')
  })

  it('maps name from name field', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Downtown Store')
  })

  it('hardcodes type to store', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('store')
  })

  it('sets isActive true when deleted_at is null', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when deleted_at is set', () => {
    const result = transformLocation({ ...raw, deleted_at: '2024-03-01T00:00:00Z' })
    expect(result.isActive).toBe(false)
  })

  it('maps address fields from physical_address', () => {
    const result = transformLocation(raw)
    expect(result.address?.city).toBe('New York')
    expect(result.address?.postalCode).toBe('10001')
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.region).toBe('NY')
    expect(result.address?.country).toBe('US')
  })

  it('sets address to undefined when physical_address is absent', () => {
    const result = transformLocation({ ...raw, physical_address: undefined })
    expect(result.address).toBeUndefined()
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
