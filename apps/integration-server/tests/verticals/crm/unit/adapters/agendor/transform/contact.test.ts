import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/agendor/transform/contact'

describe('agendor transformContact', () => {
  it('maps raw person to canonical Contact', () => {
    const raw = {
      id: 42,
      name: 'Ana Lima',
      email: 'ana@example.com',
      mobile: '+5511999999999',
      organization: { id: 10, name: 'ACME' },
      owner: { id: 5 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('42')
    expect(contact.name).toBe('Ana Lima')
    expect(contact.email).toBe('ana@example.com')
    expect(contact.mobile).toBe('+5511999999999')
    expect(contact.company_id).toBe('10')
    expect(contact.owner_id).toBe('5')
    expect(contact.metadata).toBe(raw)
  })
  it('untransforms Contact to agendor payload', () => {
    const out = untransformContact({ name: 'João', email: 'joao@example.com', company_id: '7' })
    expect(out['name']).toBe('João')
    expect(out['email']).toBe('joao@example.com')
    expect(out['organization_id']).toBe(7)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 42,
      name: 'Ana Lima',
      email: 'ana@example.com',
      mobile: '+5511999999999',
      organization: { id: 10, name: 'ACME' },
      owner: { id: 5 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
