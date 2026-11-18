import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawPlentyOneContact,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeContact(overrides: Partial<RawPlentyOneContact> = {}): RawPlentyOneContact {
  return {
    id: 5001,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@plenty.example',
    options: [
      { typeId: 2, subTypeId: 4, value: '+49-30-555-0001', priority: 0 }, // private phone
      { typeId: 3, subTypeId: 4, value: '+49-175-555-0002', priority: 0 }, // mobile
    ],
    addresses: [
      {
        id: 800,
        address1: 'Unter den Linden 1',
        postalCode: '10117',
        town: 'Berlin',
        countryIsoCode2: 'DE',
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('plentyone transformContact', () => {
  it('maps core identity fields', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('5001')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.email).toBe('ada@plenty.example')
  })

  it('picks phone from options typeId 2 (private phone)', () => {
    const result = transformContact(makeContact())
    expect(result.phone).toBe('+49-30-555-0001')
  })

  it('falls back to mobile phone (typeId 3) when private phone absent', () => {
    const contact = makeContact({
      options: [{ typeId: 3, value: '+49-175-555-0002', priority: 0 }],
    })
    const result = transformContact(contact)
    expect(result.phone).toBe('+49-175-555-0002')
  })

  it('picks email from options typeId 1 when top-level email is absent', () => {
    const contact = makeContact({
      email: null,
      options: [{ typeId: 1, value: 'from-options@plenty.example', priority: 0 }],
    })
    const result = transformContact(contact)
    expect(result.email).toBe('from-options@plenty.example')
  })

  it('maps address', () => {
    const result = transformContact(makeContact())
    expect(result.defaultAddress?.line1).toBe('Unter den Linden 1')
    expect(result.defaultAddress?.city).toBe('Berlin')
    expect(result.defaultAddress?.postalCode).toBe('10117')
    expect(result.defaultAddress?.country).toBe('DE')
  })

  it('maps timestamps as ISO strings', () => {
    const result = transformContact(makeContact())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformContact(makeContact())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformContact', () => {
    const canonical = transformContact(makeContact())
    const raw = untransformContact(canonical)
    expect(raw.firstName).toBe('Ada')
    expect(raw.lastName).toBe('Lovelace')
    expect(raw.email).toBe('ada@plenty.example')
  })
})
