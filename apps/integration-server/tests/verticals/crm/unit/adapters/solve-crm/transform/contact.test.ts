import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/contact'

describe('solve-crm transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = {
      id: 'solve-100',
      firstname: 'Maria',
      lastname: 'Garcia',
      email: 'maria@example.com',
      phone: '555-3000',
      mobile: '555-3001',
      organisation: 'org-20',
      assignee: 'user-8',
      created: '2024-02-01T00:00:00Z',
      updated: '2024-08-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('solve-100')
    expect(contact.first_name).toBe('Maria')
    expect(contact.last_name).toBe('Garcia')
    expect(contact.email).toBe('maria@example.com')
    expect(contact.phone).toBe('555-3000')
    expect(contact.mobile).toBe('555-3001')
    expect(contact.company_id).toBe('org-20')
    expect(contact.owner_id).toBe('user-8')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null optional fields gracefully', () => {
    const raw = { id: 99, organisation: null, assignee: null }
    const contact = transformContact(raw)
    expect(contact.id).toBe('99')
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'solve-100',
      firstname: 'Maria',
      lastname: 'Garcia',
      email: 'maria@example.com',
      phone: '555-3000',
      mobile: '555-3001',
      organisation: 'org-20',
      assignee: 'user-8',
      created: '2024-02-01T00:00:00Z',
      updated: '2024-08-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
