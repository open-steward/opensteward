import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type AimeosCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/aimeos/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCustomer(
  overrides: Partial<AimeosCustomer['attributes']> = {},
): AimeosCustomer {
  return {
    type: 'customer',
    id: 'cust-001',
    attributes: {
      'customer.id': 'cust-001',
      'customer.code': 'jane.doe@example.com',
      'customer.label': 'Jane Doe',
      'customer.email': 'jane.doe@example.com',
      'customer.salutation': 'ms',
      'customer.firstname': 'Jane',
      'customer.lastname': 'Doe',
      'customer.address1': '42 Baker Street',
      'customer.address2': null,
      'customer.city': 'London',
      'customer.state': 'England',
      'customer.postal': 'NW1 6XE',
      'customer.countryid': 'GB',
      'customer.telephone': '+44 20 1234 5678',
      'customer.mobile': null,
      'customer.status': 1,
      'customer.newsletter': true,
      'customer.ctime': '2024-01-15T09:00:00+00:00',
      'customer.mtime': '2024-06-01T12:00:00+00:00',
      ...overrides,
    },
  }
}

// ── transformCustomer ─────────────────────────────────────────────────────────

describe('transformCustomer (Aimeos)', () => {
  it('maps core customer fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps telephone to phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+44 20 1234 5678')
  })

  it('prefers mobile over telephone for phone field', () => {
    const result = transformCustomer(
      makeCustomer({ 'customer.mobile': '+44 7700 900000' }),
    )
    expect(result.phone).toBe('+44 7700 900000')
  })

  it('maps newsletter=true to acceptsMarketing=true', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps newsletter=false to acceptsMarketing=false', () => {
    const result = transformCustomer(makeCustomer({ 'customer.newsletter': false }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps newsletter as numeric 0 to false', () => {
    const result = transformCustomer(makeCustomer({ 'customer.newsletter': 0 }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps newsletter=undefined to undefined', () => {
    const result = transformCustomer(makeCustomer({ 'customer.newsletter': undefined }))
    expect(result.acceptsMarketing).toBeUndefined()
  })

  it('maps default address from address fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.line1).toBe('42 Baker Street')
    expect(result.defaultAddress!.city).toBe('London')
    expect(result.defaultAddress!.postalCode).toBe('NW1 6XE')
    expect(result.defaultAddress!.country).toBe('GB')
  })

  it('returns undefined defaultAddress when no address fields', () => {
    const result = transformCustomer(
      makeCustomer({
        'customer.address1': null,
        'customer.city': null,
        'customer.postal': null,
        'customer.countryid': null,
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-01-15T09:00:00+00:00')
    expect(result.updatedAt).toBe('2024-06-01T12:00:00+00:00')
  })

  it('handles missing email gracefully', () => {
    const result = transformCustomer(makeCustomer({ 'customer.email': null }))
    expect(result.email).toBeUndefined()
  })

  it('handles missing firstname and lastname', () => {
    const result = transformCustomer(
      makeCustomer({ 'customer.firstname': null, 'customer.lastname': null }),
    )
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

// ── untransformCustomer ───────────────────────────────────────────────────────

describe('untransformCustomer (Aimeos)', () => {
  it('produces JSON:API body with correct resource type', () => {
    const body = untransformCustomer({ email: 'new@example.com' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('customer')
    expect(body.data.attributes['customer.email']).toBe('new@example.com')
  })

  it('maps firstName to customer.firstname', () => {
    const body = untransformCustomer({ firstName: 'John' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['customer.firstname']).toBe('John')
  })

  it('maps lastName to customer.lastname', () => {
    const body = untransformCustomer({ lastName: 'Smith' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['customer.lastname']).toBe('Smith')
  })

  it('maps phone to customer.telephone', () => {
    const body = untransformCustomer({ phone: '+1-555-0100' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['customer.telephone']).toBe('+1-555-0100')
  })

  it('maps acceptsMarketing to customer.newsletter', () => {
    const body = untransformCustomer({ acceptsMarketing: true }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['customer.newsletter']).toBe(true)
  })

  it('maps defaultAddress fields', () => {
    const body = untransformCustomer({
      defaultAddress: {
        line1: '10 Downing St',
        city: 'London',
        postalCode: 'SW1A 2AA',
        country: 'GB',
      },
    }) as { data: { attributes: Record<string, unknown> } }
    expect(body.data.attributes['customer.address1']).toBe('10 Downing St')
    expect(body.data.attributes['customer.city']).toBe('London')
    expect(body.data.attributes['customer.postal']).toBe('SW1A 2AA')
    expect(body.data.attributes['customer.countryid']).toBe('GB')
  })

  it('omits undefined fields', () => {
    const body = untransformCustomer({}) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['customer.email']).toBeUndefined()
    expect(body.data.attributes['customer.firstname']).toBeUndefined()
  })
})
