import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/corporatestack/transform/contact'

describe('corporatestack transformContact', () => {
  it('maps raw CorporateStack contact to canonical Contact', () => {
    const raw = {
      id: 'cs-001',
      first_name: 'Mohammed',
      last_name: 'Al-Rashidi',
      name: 'Mohammed Al-Rashidi',
      email: 'mohammed@example.ae',
      phone: '+97141234567',
      mobile: '+971509876543',
      company_id: 'comp-20',
      owner_id: 'user-5',
      created_at: '2023-06-01T00:00:00Z',
      updated_at: '2023-12-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('cs-001')
    expect(contact.first_name).toBe('Mohammed')
    expect(contact.last_name).toBe('Al-Rashidi')
    expect(contact.name).toBe('Mohammed Al-Rashidi')
    expect(contact.email).toBe('mohammed@example.ae')
    expect(contact.phone).toBe('+97141234567')
    expect(contact.mobile).toBe('+971509876543')
    expect(contact.company_id).toBe('comp-20')
    expect(contact.owner_id).toBe('user-5')
    expect(contact.created_at).toBe('2023-06-01T00:00:00Z')
    expect(contact.updated_at).toBe('2023-12-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'cs-002' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('cs-002')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('builds name from first_name + last_name when name field is absent', () => {
    const raw = { id: 'cs-003', first_name: 'Fatima', last_name: 'Al-Zaabi' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Fatima Al-Zaabi')
    expect(contact.metadata).toBe(raw)
  })

  it('converts numeric id to string', () => {
    const raw = { id: 999, first_name: 'Ahmad' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('999')
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to CorporateStack shape', () => {
    const data = {
      first_name: 'Khalid',
      last_name: 'Al-Mansoori',
      email: 'khalid@example.ae',
      phone: '+97142345678',
      company_id: 'comp-5',
    }
    const out = untransformContact(data)
    expect(out.first_name).toBe('Khalid')
    expect(out.last_name).toBe('Al-Mansoori')
    expect(out.email).toBe('khalid@example.ae')
    expect(out.phone).toBe('+97142345678')
    expect(out.company_id).toBe('comp-5')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'cs-001',
      first_name: 'Mohammed',
      last_name: 'Al-Rashidi',
      name: 'Mohammed Al-Rashidi',
      email: 'mohammed@example.ae',
      phone: '+97141234567',
      mobile: '+971509876543',
      company_id: 'comp-20',
      owner_id: 'user-5',
      created_at: '2023-06-01T00:00:00Z',
      updated_at: '2023-12-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
