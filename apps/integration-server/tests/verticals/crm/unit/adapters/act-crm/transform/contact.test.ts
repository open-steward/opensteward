import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/act-crm/transform/contact'

describe('act-crm transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = {
      id: 'act-001',
      firstName: 'Bob',
      lastName: 'Johnson',
      fullName: 'Bob Johnson',
      emailAddress: 'bob@example.com',
      phone: '555-2000',
      mobilePhone: '555-2001',
      companyId: 'company-10',
      managerId: 'mgr-5',
      created: '2023-05-01T00:00:00Z',
      edited: '2024-01-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('act-001')
    expect(contact.first_name).toBe('Bob')
    expect(contact.last_name).toBe('Johnson')
    expect(contact.name).toBe('Bob Johnson')
    expect(contact.email).toBe('bob@example.com')
    expect(contact.phone).toBe('555-2000')
    expect(contact.mobile).toBe('555-2001')
    expect(contact.company_id).toBe('company-10')
    expect(contact.owner_id).toBe('mgr-5')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null optional fields gracefully', () => {
    const raw = { id: 'act-002', companyId: null, managerId: null }
    const contact = transformContact(raw)
    expect(contact.id).toBe('act-002')
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'act-001',
      firstName: 'Bob',
      lastName: 'Johnson',
      fullName: 'Bob Johnson',
      emailAddress: 'bob@example.com',
      phone: '555-2000',
      mobilePhone: '555-2001',
      companyId: 'company-10',
      managerId: 'mgr-5',
      created: '2023-05-01T00:00:00Z',
      edited: '2024-01-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
