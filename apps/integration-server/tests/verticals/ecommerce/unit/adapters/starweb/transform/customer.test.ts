import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStarwebCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/starweb/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawStarwebCustomer> = {}): RawStarwebCustomer {
  return {
    customerId: 42,
    createdAt: '2024-01-10T08:00:00.000Z',
    modifiedAt: '2024-06-01T12:00:00.000Z',
    type: 'person',
    email: 'anna.svensson@example.se',
    approved: true,
    langCode: 'sv',
    addresses: {
      data: {
        invoice: {
          firstName: 'Anna',
          lastName: 'Svensson',
          address: 'Drottninggatan 10',
          postalCode: '11151',
          city: 'Stockholm',
          countryCode: 'SE',
          phoneNo: '+46 8 123 456',
          state: 'Stockholms län',
        },
        delivery: {
          firstName: 'Anna',
          lastName: 'Svensson',
          address: 'Kungsgatan 5',
          postalCode: '11143',
          city: 'Stockholm',
          countryCode: 'SE',
        },
      },
    },
    ...overrides,
  }
}

describe('transformCustomer (Starweb)', () => {
  it('stringifies customerId as id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('anna.svensson@example.se')
  })

  it('maps firstName/lastName from invoice address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Anna')
    expect(result.lastName).toBe('Svensson')
  })

  it('maps phone from invoice.phoneNo', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+46 8 123 456')
  })

  it('maps billing address (invoice) as defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('Drottninggatan 10')
    expect(result.defaultAddress?.city).toBe('Stockholm')
    expect(result.defaultAddress?.postalCode).toBe('11151')
    expect(result.defaultAddress?.country).toBe('SE')
    expect(result.defaultAddress?.region).toBe('Stockholms län')
  })

  it('includes both invoice and delivery in addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(2)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T12:00:00.000Z')
  })

  it('returns undefined addresses when no address data present', () => {
    const result = transformCustomer(makeCustomer({ addresses: undefined }))
    expect(result.addresses).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('anna.svensson@example.se')
    expect(body['type']).toBe('person')
    const addrs = body['addresses'] as { invoice: Record<string, unknown> }
    expect(addrs.invoice['firstName']).toBe('Anna')
    expect(addrs.invoice['lastName']).toBe('Svensson')
    expect(addrs.invoice['city']).toBe('Stockholm')
    expect(addrs.invoice['countryCode']).toBe('SE')
  })
})
