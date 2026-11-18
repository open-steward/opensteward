import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/contact'

describe('sellsy transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = { id: '1001', firstname: 'Marie', lastname: 'Dupont', email: 'marie@example.fr', phone_number: '+33612345678', linked_company_id: '500' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('1001')
    expect(contact.first_name).toBe('Marie')
    expect(contact.last_name).toBe('Dupont')
    expect(contact.company_id).toBe('500')
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: '1001', firstname: 'Marie', lastname: 'Dupont', email: 'marie@example.fr', phone_number: '+33612345678', linked_company_id: '500' }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
