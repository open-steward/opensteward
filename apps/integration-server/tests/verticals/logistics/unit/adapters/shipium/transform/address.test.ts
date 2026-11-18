import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  toShipiumAddress,
  type ShipiumAddress,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeRaw(overrides: Partial<ShipiumAddress> = {}): ShipiumAddress {
  return {
    name: 'Jane Doe',
    company: 'Acme Corp',
    street1: '123 Main St',
    street2: 'Suite 100',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94114',
    countryCode: 'US',
    phone: '+14155550123',
    email: 'jane@acme.example',
    ...overrides,
  }
}

describe('transformAddress', () => {
  it('maps canonical address fields', () => {
    const raw = makeRaw()
    const result = transformAddress(raw)

    expect(result?.name).toBe('Jane Doe')
    expect(result?.company).toBe('Acme Corp')
    expect(result?.street1).toBe('123 Main St')
    expect(result?.street2).toBe('Suite 100')
    expect(result?.city).toBe('San Francisco')
    expect(result?.state).toBe('CA')
    expect(result?.postalCode).toBe('94114')
    expect(result?.country).toBe('US')
    expect(result?.phone).toBe('+14155550123')
    expect(result?.email).toBe('jane@acme.example')
  })

  it('maps countryCode to country field', () => {
    const raw = makeRaw({ countryCode: 'GB' })
    expect(transformAddress(raw)?.country).toBe('GB')
  })

  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformAddress(makeRaw())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })

  it('converts null string fields to undefined', () => {
    const raw = makeRaw({ street2: null, company: null })
    const result = transformAddress(raw)
    expect(result?.street2).toBeUndefined()
    expect(result?.company).toBeUndefined()
  })
})

describe('toShipiumAddress (untransform)', () => {
  it('maps canonical address back to Shipium shape', () => {
    const canonical = transformAddress(makeRaw())!
    const back = toShipiumAddress(canonical)!

    expect(back.name).toBe('Jane Doe')
    expect(back.city).toBe('San Francisco')
    expect(back.countryCode).toBe('US')
    expect(back.addressType).toBe('commercial')
  })

  it('returns undefined for undefined input', () => {
    expect(toShipiumAddress(undefined)).toBeUndefined()
  })

  it('round-trips address without loss', () => {
    const canonical = transformAddress(makeRaw())!
    const back = toShipiumAddress(canonical)!
    const roundTripped = transformAddress(back)!

    expect(roundTripped.name).toBe(canonical.name)
    expect(roundTripped.city).toBe(canonical.city)
    expect(roundTripped.country).toBe(canonical.country)
  })
})
