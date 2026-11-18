import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/contact'

describe('qiscus transformContact', () => {
  it('maps raw Qiscus customer to canonical Contact', () => {
    const raw = {
      id: 'cust-789',
      name: 'Wei Lin',
      email: 'wei.lin@example.sg',
      phone: '+6591234567',
      created_at: '2023-09-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('cust-789')
    expect(contact.name).toBe('Wei Lin')
    expect(contact.email).toBe('wei.lin@example.sg')
    expect(contact.phone).toBe('+6591234567')
    expect(contact.created_at).toBe('2023-09-01T00:00:00Z')
    expect(contact.updated_at).toBe('2024-01-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 999 }
    const contact = transformContact(raw)
    expect(contact.id).toBe('999')
    expect(contact.email).toBeUndefined()
    expect(contact.phone).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('extracts email from additional_info when not at top level', () => {
    const raw = {
      id: 'cust-111',
      name: 'Ahmad Zaki',
      additional_info: [
        { field_name: 'email', value: 'ahmad@example.my' },
        { field_name: 'phone', value: '+60123456789' },
      ],
    }
    const contact = transformContact(raw)
    expect(contact.email).toBe('ahmad@example.my')
    expect(contact.phone).toBe('+60123456789')
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to Qiscus shape', () => {
    const data = {
      name: 'Mei Xin',
      email: 'mei@example.sg',
      phone: '+6598765432',
    }
    const out = untransformContact(data)
    expect(out.name).toBe('Mei Xin')
    expect(out.email).toBe('mei@example.sg')
    expect(out.phone).toBe('+6598765432')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'cust-789',
      name: 'Wei Lin',
      email: 'wei.lin@example.sg',
      phone: '+6591234567',
      created_at: '2023-09-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
