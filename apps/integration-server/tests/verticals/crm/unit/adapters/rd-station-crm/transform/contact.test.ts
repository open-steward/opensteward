import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/contact'

describe('rd-station-crm transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = { _id: 'mongo-abc', name: 'Fernanda Silva', email: 'fernanda@example.com.br', phones: [{ phone: '+5511987654321' }], organization: { _id: 'org-xyz' } }
    const contact = transformContact(raw)
    expect(contact.id).toBe('mongo-abc')
    expect(contact.name).toBe('Fernanda Silva')
    expect(contact.phone).toBe('+5511987654321')
    expect(contact.company_id).toBe('org-xyz')
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { _id: 'mongo-abc', name: 'Fernanda Silva', email: 'fernanda@example.com.br', phones: [{ phone: '+5511987654321' }], organization: { _id: 'org-xyz' } }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
