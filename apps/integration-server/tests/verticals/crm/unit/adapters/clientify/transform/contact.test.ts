import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/clientify/transform/contact'

describe('clientify transformContact', () => {
  it('maps raw Clientify contact to canonical Contact', () => {
    const raw = {
      id: 99,
      first_name: 'Isabel',
      last_name: 'García',
      email: 'isabel@empresa.es',
      phone: '+34912345678',
      mobile: '+34634567890',
      company: 15,
      owner: 2,
      date_added: '2024-03-01T00:00:00Z',
      date_modified: '2024-08-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('99')
    expect(contact.first_name).toBe('Isabel')
    expect(contact.last_name).toBe('García')
    expect(contact.name).toBe('Isabel García')
    expect(contact.email).toBe('isabel@empresa.es')
    expect(contact.phone).toBe('+34912345678')
    expect(contact.mobile).toBe('+34634567890')
    expect(contact.company_id).toBe('15')
    expect(contact.owner_id).toBe('2')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = { id: '7', company: null, owner: null }
    const contact = transformContact(raw)
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms Contact to Clientify payload', () => {
    const out = untransformContact({ first_name: 'Pedro', last_name: 'López', email: 'pedro@test.com' })
    expect(out['first_name']).toBe('Pedro')
    expect(out['last_name']).toBe('López')
    expect(out['email']).toBe('pedro@test.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 99,
      first_name: 'Isabel',
      last_name: 'García',
      email: 'isabel@empresa.es',
      phone: '+34912345678',
      mobile: '+34634567890',
      company: 15,
      owner: 2,
      date_added: '2024-03-01T00:00:00Z',
      date_modified: '2024-08-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
