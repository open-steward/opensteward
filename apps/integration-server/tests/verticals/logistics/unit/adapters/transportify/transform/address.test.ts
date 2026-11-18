import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type TransportifyLocation,
} from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeRaw(overrides: Partial<TransportifyLocation> = {}): TransportifyLocation {
  return {
    address: '1 Rizal Ave, Manila',
    latitude: 14.5995,
    longitude: 120.9842,
    recipient_name: 'Juan dela Cruz',
    recipient_phone: '+63 912 345 6789',
    note: 'Leave at front desk',
    is_payer: false,
    need_cod: false,
    need_pod: true,
    cod_invoice_fees: null,
    ...overrides,
  }
}

describe('transportify transformLocation', () => {
  it('maps address to street1', () => {
    expect(transformLocation(makeRaw())?.street1).toBe('1 Rizal Ave, Manila')
  })

  it('maps recipient_name to name', () => {
    expect(transformLocation(makeRaw())?.name).toBe('Juan dela Cruz')
  })

  it('maps recipient_phone to phone', () => {
    expect(transformLocation(makeRaw())?.phone).toBe('+63 912 345 6789')
  })

  it('passes AddressSchema.parse without throwing', () => {
    // AddressSchema.country is Iso3166Alpha2 (2-char uppercase) — we don't set it here,
    // so the output contains no country field and should be valid.
    expect(() => AddressSchema.parse(transformLocation(makeRaw()))).not.toThrow()
  })

  it('returns undefined for null input', () => {
    expect(transformLocation(null)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(transformLocation(undefined)).toBeUndefined()
  })

  it('returns undefined when address, recipient_name, and recipient_phone are all null', () => {
    const result = transformLocation(
      makeRaw({ address: null, recipient_name: null, recipient_phone: null }),
    )
    expect(result).toBeUndefined()
  })

  it('returns an Address when only recipient_name is present', () => {
    const result = transformLocation(makeRaw({ address: null, recipient_phone: null }))
    expect(result).toBeDefined()
    expect(result?.name).toBe('Juan dela Cruz')
  })

  it('returns an Address when only address is present', () => {
    const result = transformLocation(makeRaw({ recipient_name: null, recipient_phone: null }))
    expect(result).toBeDefined()
    expect(result?.street1).toBe('1 Rizal Ave, Manila')
  })
})
