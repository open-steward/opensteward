import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/bexio/transform/contact'

describe('bexio transformContact', () => {
  it('maps Bexio person contact to canonical Contact', () => {
    const raw = {
      id: 33,
      name_1: 'Hans',
      name_2: 'Müller',
      mail: 'hans@example.ch',
      phone_fixed: '+41441234567',
      phone_mobile: '+41791234567',
      contact_type_id: 2,
      owner_id: 1,
      created_at: '2023-05-01T00:00:00Z',
      updated_at: '2023-10-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('33')
    expect(contact.first_name).toBe('Hans')
    expect(contact.last_name).toBe('Müller')
    expect(contact.name).toBe('Hans Müller')
    expect(contact.email).toBe('hans@example.ch')
    expect(contact.phone).toBe('+41441234567')
    expect(contact.mobile).toBe('+41791234567')
    expect(contact.owner_id).toBe('1')
    expect(contact.created_at).toBe('2023-05-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 7 }
    const contact = transformContact(raw)
    expect(contact.id).toBe('7')
    expect(contact.email).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to Bexio contact (person)', () => {
    const data = { first_name: 'Lena', last_name: 'Keller', email: 'lena@example.ch', phone: '+41441111111' }
    const out = untransformContact(data)
    expect(out.name_1).toBe('Lena')
    expect(out.name_2).toBe('Keller')
    expect(out.mail).toBe('lena@example.ch')
    expect(out.phone_fixed).toBe('+41441111111')
    expect(out.contact_type_id).toBe(2)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 33,
      name_1: 'Hans',
      name_2: 'Müller',
      mail: 'hans@example.ch',
      phone_fixed: '+41441234567',
      phone_mobile: '+41791234567',
      contact_type_id: 2,
      owner_id: 1,
      created_at: '2023-05-01T00:00:00Z',
      updated_at: '2023-10-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
