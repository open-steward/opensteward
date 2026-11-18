import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type TerminalAfricaAddress,
} from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<TerminalAfricaAddress> = {}): TerminalAfricaAddress {
  return {
    name: 'Alice Okonkwo',
    line1: '12 Victoria Island',
    line2: 'Suite 4',
    city: 'Lagos',
    state: 'Lagos State',
    zip: '101001',
    country: 'NG',
    phone: '+2348001234567',
    email: 'alice@acme.example',
    ...overrides,
  }
}

describe('terminal-africa transformAddress', () => {
  it('maps line1 → street1', () => {
    const r = transformAddress(makeAddress())
    expect(r.street1).toBe('12 Victoria Island')
  })

  it('maps zip → postalCode', () => {
    const r = transformAddress(makeAddress())
    expect(r.postalCode).toBe('101001')
  })

  it('maps name directly when present', () => {
    const r = transformAddress(makeAddress())
    expect(r.name).toBe('Alice Okonkwo')
  })

  it('concatenates first_name + last_name when name is absent', () => {
    const r = transformAddress(
      makeAddress({ name: null, first_name: 'Alice', last_name: 'Okonkwo' }),
    )
    expect(r.name).toBe('Alice Okonkwo')
  })

  it('never uses the `user` account id as a name', () => {
    const r = transformAddress(
      makeAddress({ name: null, first_name: null, last_name: null, user: 'USER-12568655307' }),
    )
    expect(r.name).toBeUndefined()
  })

  it('keeps an ISO alpha-2 country (documented: "ISO 2 country code for address. e.g. NG")', () => {
    expect(AddressSchema.parse(transformAddress(makeAddress({ country: 'NG' }))).country).toBe('NG')
  })

  it("drops the alpha-3 'NGA' the shipment examples carry rather than guess", () => {
    const r = transformAddress(makeAddress({ country: 'NGA' }))
    expect(r.country).toBeUndefined()
    expect(() => AddressSchema.parse(r)).not.toThrow()
  })

  it('maps optional email and phone', () => {
    const r = transformAddress(makeAddress())
    expect(r.email).toBe('alice@acme.example')
    expect(r.phone).toBe('+2348001234567')
  })

  it('passes AddressSchema validation', () => {
    const result = transformAddress(makeAddress())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })

  it('handles all-null optional fields gracefully', () => {
    const r = transformAddress({
      name: null,
      first_name: null,
      last_name: null,
      user: null,
      line1: null,
      line2: null,
      city: null,
      state: null,
      zip: null,
      country: null,
      phone: null,
      email: null,
    })
    expect(r.name).toBeUndefined()
    expect(r.street1).toBeUndefined()
    expect(() => AddressSchema.parse(r)).not.toThrow()
  })
})
