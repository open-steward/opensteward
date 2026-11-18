import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type Parcel2GoAddress,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/address'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<Parcel2GoAddress> = {}): Parcel2GoAddress {
  return {
    Name: 'Jane Doe',
    Property: '2A',
    Street: 'High Street',
    Town: 'Manchester',
    County: 'Greater Manchester',
    Postcode: 'M1 1AE',
    Country: 'GB',
    Email: 'jane@example.com',
    Phone: '+447700900001',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcel2go transformAddress', () => {
  it('maps name from Name', () => {
    expect(transformAddress(makeAddress()).name).toBe('Jane Doe')
  })

  it('maps street1 from Property when present', () => {
    expect(transformAddress(makeAddress()).street1).toBe('2A')
  })

  it('falls back street1 to Street when Property is null', () => {
    expect(transformAddress(makeAddress({ Property: null })).street1).toBe('High Street')
  })

  it('maps street2 from Street when both Property and Street are present', () => {
    expect(transformAddress(makeAddress()).street2).toBe('High Street')
  })

  it('omits street2 when Property is null (no double-mapping)', () => {
    expect(transformAddress(makeAddress({ Property: null })).street2).toBeUndefined()
  })

  it('maps city from Town', () => {
    expect(transformAddress(makeAddress()).city).toBe('Manchester')
  })

  it('maps state from County', () => {
    expect(transformAddress(makeAddress()).state).toBe('Greater Manchester')
  })

  it('maps postalCode from Postcode', () => {
    expect(transformAddress(makeAddress()).postalCode).toBe('M1 1AE')
  })

  it('maps country from Country', () => {
    expect(transformAddress(makeAddress()).country).toBe('GB')
  })

  it('maps phone from Phone', () => {
    expect(transformAddress(makeAddress()).phone).toBe('+447700900001')
  })

  it('maps email from Email', () => {
    expect(transformAddress(makeAddress()).email).toBe('jane@example.com')
  })

  it('handles all null fields gracefully', () => {
    const r = transformAddress({})
    expect(r.name).toBeUndefined()
    expect(r.street1).toBeUndefined()
    expect(r.city).toBeUndefined()
  })
})
