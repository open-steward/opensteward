import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawClarifyPerson,
} from '../../../../../../../src/verticals/crm/adapters/clarify/transform/contact'

function makeRaw(overrides: Partial<RawClarifyPerson> = {}): RawClarifyPerson {
  return { id: 'p-1', attributes: {}, ...overrides }
}

describe('clarify transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 'p-42' })).id).toBe('p-42')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(
      makeRaw({ attributes: { first_name: 'Jane', last_name: 'Smith' } }),
    )
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Smith')
  })

  it('uses name field directly when present', () => {
    const result = transformContact(
      makeRaw({ attributes: { name: 'Full Name', first_name: 'Full', last_name: 'Name' } }),
    )
    expect(result.name).toBe('Full Name')
  })

  it('falls back to joining first_name + last_name when name is absent', () => {
    const result = transformContact(
      makeRaw({ attributes: { first_name: 'Alice', last_name: 'Jones' } }),
    )
    expect(result.name).toBe('Alice Jones')
  })

  it('name is undefined when all name parts are absent', () => {
    const result = transformContact(makeRaw({ attributes: {} }))
    expect(result.name).toBeUndefined()
  })

  it('picks email from object-style ClarifyEmailEntry array', () => {
    const result = transformContact(
      makeRaw({ attributes: { email_addresses: [{ value: 'obj@example.com', type: 'work' }] } }),
    )
    expect(result.email).toBe('obj@example.com')
  })

  it('picks email from plain string array', () => {
    const result = transformContact(
      makeRaw({ attributes: { email_addresses: ['str@example.com'] } }),
    )
    expect(result.email).toBe('str@example.com')
  })

  it('returns undefined email when email_addresses is empty', () => {
    const result = transformContact(makeRaw({ attributes: { email_addresses: [] } }))
    expect(result.email).toBeUndefined()
  })

  it('picks phone from object-style ClarifyPhoneEntry array', () => {
    const result = transformContact(
      makeRaw({ attributes: { phone_numbers: [{ value: '+1-555-0100', type: 'work' }] } }),
    )
    expect(result.phone).toBe('+1-555-0100')
  })

  it('picks phone from plain string array', () => {
    const result = transformContact(
      makeRaw({ attributes: { phone_numbers: ['+1-555-0200'] } }),
    )
    expect(result.phone).toBe('+1-555-0200')
  })

  it('maps title, company_id, owner_id, timestamps', () => {
    const result = transformContact(
      makeRaw({
        attributes: {
          title: 'VP Sales',
          company_id: 'co-7',
          owner_id: 'u-3',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-06-01T00:00:00Z',
        },
      }),
    )
    expect(result.title).toBe('VP Sales')
    expect(result.company_id).toBe('co-7')
    expect(result.owner_id).toBe('u-3')
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
    expect(result.updated_at).toBe('2024-06-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'p-42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('clarify untransformContact', () => {
  it('wraps output in JSON:API data envelope with type "person"', () => {
    const result = untransformContact({ first_name: 'Jane', last_name: 'Smith' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(result.data.type).toBe('person')
    expect(result.data.attributes.first_name).toBe('Jane')
    expect(result.data.attributes.last_name).toBe('Smith')
  })

  it('wraps email as email_addresses array with work type', () => {
    const result = untransformContact({ email: 'me@example.com' }) as {
      data: { attributes: { email_addresses: Array<{ value: string; type: string }> } }
    }
    expect(result.data.attributes.email_addresses).toEqual([
      { value: 'me@example.com', type: 'work' },
    ])
  })

  it('wraps phone as phone_numbers array with work type', () => {
    const result = untransformContact({ phone: '+1-555-0300' }) as {
      data: { attributes: { phone_numbers: Array<{ value: string; type: string }> } }
    }
    expect(result.data.attributes.phone_numbers).toEqual([
      { value: '+1-555-0300', type: 'work' },
    ])
  })

  it('omits keys that are not provided', () => {
    const result = untransformContact({}) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(result.data.attributes).not.toHaveProperty('email_addresses')
    expect(result.data.attributes).not.toHaveProperty('first_name')
  })
})
