import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/bullhorn/transform/contact'

describe('bullhorn transformContact', () => {
  it('maps raw Bullhorn ClientContact to canonical Contact', () => {
    const raw = {
      id: 1001,
      firstName: 'James',
      lastName: 'Smith',
      name: 'James Smith',
      email: 'james.smith@example.com',
      phone: '+61299999999',
      mobile: '+61412345678',
      clientCorporation: { id: 50 },
      owner: { id: 7 },
      dateAdded: 1672531200000,
      dateLastModified: 1699747200000,
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('1001')
    expect(contact.first_name).toBe('James')
    expect(contact.last_name).toBe('Smith')
    expect(contact.name).toBe('James Smith')
    expect(contact.email).toBe('james.smith@example.com')
    expect(contact.phone).toBe('+61299999999')
    expect(contact.mobile).toBe('+61412345678')
    expect(contact.company_id).toBe('50')
    expect(contact.owner_id).toBe('7')
    expect(contact.created_at).toBe(new Date(1672531200000).toISOString())
    expect(contact.updated_at).toBe(new Date(1699747200000).toISOString())
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 2002 }
    const contact = transformContact(raw)
    expect(contact.id).toBe('2002')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.created_at).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('builds name from firstName + lastName when name field is absent', () => {
    const raw = { id: 3003, firstName: 'Sarah', lastName: 'Connor' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Sarah Connor')
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to Bullhorn shape', () => {
    const data = {
      first_name: 'Alex',
      last_name: 'Turner',
      email: 'alex@example.com',
      phone: '+61300000000',
      company_id: '42',
      owner_id: '9',
    }
    const out = untransformContact(data)
    expect(out.firstName).toBe('Alex')
    expect(out.lastName).toBe('Turner')
    expect(out.email).toBe('alex@example.com')
    expect(out.phone).toBe('+61300000000')
    expect(out.clientCorporation).toEqual({ id: 42 })
    expect(out.owner).toEqual({ id: 9 })
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 1001,
      firstName: 'James',
      lastName: 'Smith',
      name: 'James Smith',
      email: 'james.smith@example.com',
      phone: '+61299999999',
      mobile: '+61412345678',
      clientCorporation: { id: 50 },
      owner: { id: 7 },
      dateAdded: 1672531200000,
      dateLastModified: 1699747200000,
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
