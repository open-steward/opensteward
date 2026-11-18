import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/contact'

describe('ontraport transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = {
      id: '12345',
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      office_phone: '555-1234',
      cell_phone: '555-5678',
      company_id: '99',
      owner: '7',
      date: '2024-01-01T00:00:00Z',
      dlm: '2024-06-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('12345')
    expect(contact.first_name).toBe('Jane')
    expect(contact.last_name).toBe('Doe')
    expect(contact.name).toBe('Jane Doe')
    expect(contact.email).toBe('jane@example.com')
    expect(contact.phone).toBe('555-1234')
    expect(contact.mobile).toBe('555-5678')
    expect(contact.company_id).toBe('99')
    expect(contact.owner_id).toBe('7')
    expect(contact.created_at).toBe('2024-01-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null optional fields gracefully', () => {
    const raw = { id: '1', company_id: null, owner: null }
    const contact = transformContact(raw)
    expect(contact.id).toBe('1')
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: '12345',
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      office_phone: '555-1234',
      cell_phone: '555-5678',
      company_id: '99',
      owner: '7',
      date: '2024-01-01T00:00:00Z',
      dlm: '2024-06-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
