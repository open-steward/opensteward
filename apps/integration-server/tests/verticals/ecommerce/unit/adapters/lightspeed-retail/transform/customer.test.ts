import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawLightspeedCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawLightspeedCustomer> = {}): RawLightspeedCustomer {
  return {
    customerID: '201',
    firstName: 'Ada',
    lastName: 'Lovelace',
    createTime: '2024-01-15T10:00:00+00:00',
    timeStamp: '2024-03-01T12:00:00+00:00',
    Contact: {
      contactID: 'C_201',
      noEmail: 'false',
      Emails: {
        ContactEmail: { address: 'ada@example.com', useType: 'Primary' },
      },
      Phones: {
        ContactPhone: { number: '+1 555 000 1111', useType: 'Primary' },
      },
      Addresses: {
        ContactAddress: {
          address1: '1 Computing Ln',
          city: 'London',
          zip: 'NW1 2AB',
          country: 'GB',
        },
      },
    },
    ...overrides,
  }
}

describe('transformCustomer (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('201')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
  })

  it('maps address fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Computing Ln')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('maps marketing preferences', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBeUndefined()
  })

  it('maps noEmail=true to acceptsMarketing=false', () => {
    const raw = makeCustomer()
    raw.Contact!.noEmail = 'true'
    const result = transformCustomer(raw)
    expect(result.acceptsMarketing).toBe(false)
  })

  it('handles multiple emails — picks primary', () => {
    const raw = makeCustomer()
    raw.Contact!.Emails = {
      ContactEmail: [
        { address: 'work@example.com', useType: 'Work' },
        { address: 'ada@example.com', useType: 'Primary' },
      ],
    }
    const result = transformCustomer(raw)
    expect(result.email).toBe('ada@example.com')
  })

  it('handles no contact data gracefully', () => {
    const result = transformCustomer(makeCustomer({ Contact: undefined }))
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['firstName']).toBe('Ada')
    expect(raw['lastName']).toBe('Lovelace')
    const contact = raw['Contact'] as Record<string, unknown>
    expect(contact).toBeDefined()
  })
})
