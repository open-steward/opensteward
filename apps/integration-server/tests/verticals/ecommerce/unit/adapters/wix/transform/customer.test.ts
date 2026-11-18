import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWixContact,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeContact(overrides: Partial<RawWixContact> = {}): RawWixContact {
  return {
    id: 'contact-001',
    info: {
      name: { first: 'Ada', last: 'Lovelace' },
      emails: [{ email: 'ada@example.com', primary: true }],
      phones: [{ phone: '+1 555 000 1111', primary: true }],
      addresses: [
        {
          address: {
            addressLine: '1 Programming Ln',
            city: 'London',
            postalCode: 'NW1 2AB',
            country: 'GB',
            subdivision: 'England',
          },
        },
      ],
      labelKeys: ['vip', 'early-access'],
    },
    createdDate: '2023-01-01T00:00:00Z',
    updatedDate: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields from Wix Contact', () => {
    const result = transformCustomer(makeContact())
    expect(result.id).toBe('contact-001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
  })

  it('maps labels as tags', () => {
    const result = transformCustomer(makeContact())
    expect(result.tags).toEqual(['vip', 'early-access'])
  })

  it('maps addresses', () => {
    const result = transformCustomer(makeContact())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.addresses).toHaveLength(1)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeContact()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeContact())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeContact())
    const raw = untransformCustomer(canonical)
    const info = raw.info as Record<string, unknown>
    expect((info.name as Record<string, unknown>).first).toBe('Ada')
    expect((info.name as Record<string, unknown>).last).toBe('Lovelace')
    expect((info.emails as Array<Record<string, unknown>>)[0]!.email).toBe('ada@example.com')
    expect((info.phones as Array<Record<string, unknown>>)[0]!.phone).toBe('+1 555 000 1111')
  })

  it('uses first email when no primary is set', () => {
    const contact = makeContact()
    contact.info!.emails = [{ email: 'fallback@example.com' }]
    const result = transformCustomer(contact)
    expect(result.email).toBe('fallback@example.com')
  })

  it('handles missing info gracefully', () => {
    const result = transformCustomer({ id: 'min' })
    expect(result.id).toBe('min')
    expect(result.email).toBeUndefined()
    expect(result.firstName).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
