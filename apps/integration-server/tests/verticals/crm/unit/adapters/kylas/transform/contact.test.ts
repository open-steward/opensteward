import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/kylas/transform/contact'

describe('kylas transformContact', () => {
  it('maps raw Kylas contact to canonical Contact', () => {
    const raw = {
      id: 101,
      firstName: 'Rahul',
      lastName: 'Sharma',
      name: 'Rahul Sharma',
      email: 'rahul@example.in',
      phoneNumber: '+919876543210',
      mobileNumber: '+919123456789',
      companyId: 55,
      ownedBy: { id: 8 },
      createdAt: '2023-05-01T00:00:00Z',
      updatedAt: '2023-11-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('101')
    expect(contact.first_name).toBe('Rahul')
    expect(contact.last_name).toBe('Sharma')
    expect(contact.name).toBe('Rahul Sharma')
    expect(contact.email).toBe('rahul@example.in')
    expect(contact.phone).toBe('+919876543210')
    expect(contact.mobile).toBe('+919123456789')
    expect(contact.company_id).toBe('55')
    expect(contact.owner_id).toBe('8')
    expect(contact.created_at).toBe('2023-05-01T00:00:00Z')
    expect(contact.updated_at).toBe('2023-11-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 202 }
    const contact = transformContact(raw)
    expect(contact.id).toBe('202')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('builds name from firstName + lastName when name field is absent', () => {
    const raw = { id: 303, firstName: 'Priya', lastName: 'Nair' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Priya Nair')
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to Kylas shape', () => {
    const data = {
      first_name: 'Anita',
      last_name: 'Patel',
      email: 'anita@example.in',
      phone: '+918765432109',
      company_id: '77',
    }
    const out = untransformContact(data)
    expect(out.firstName).toBe('Anita')
    expect(out.lastName).toBe('Patel')
    expect(out.email).toBe('anita@example.in')
    expect(out.phoneNumber).toBe('+918765432109')
    expect(out.companyId).toBe(77)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 101,
      firstName: 'Rahul',
      lastName: 'Sharma',
      name: 'Rahul Sharma',
      email: 'rahul@example.in',
      phoneNumber: '+919876543210',
      mobileNumber: '+919123456789',
      companyId: 55,
      ownedBy: { id: 8 },
      createdAt: '2023-05-01T00:00:00Z',
      updatedAt: '2023-11-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
