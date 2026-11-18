import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/crm-com/transform/contact'

describe('crm-com transformContact', () => {
  it('maps raw CRM.COM contact to canonical Contact', () => {
    const raw = {
      id: 'crmcom-001',
      first_name: 'Layla',
      last_name: 'Al-Hassan',
      name: 'Layla Al-Hassan',
      email: 'layla@example.com',
      phone: '+971501234567',
      mobile: '+971509876543',
      company_id: 'org-42',
      owner_id: 'user-7',
      created_date: '2023-04-01T00:00:00Z',
      updated_date: '2023-10-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('crmcom-001')
    expect(contact.first_name).toBe('Layla')
    expect(contact.last_name).toBe('Al-Hassan')
    expect(contact.name).toBe('Layla Al-Hassan')
    expect(contact.email).toBe('layla@example.com')
    expect(contact.phone).toBe('+971501234567')
    expect(contact.mobile).toBe('+971509876543')
    expect(contact.company_id).toBe('org-42')
    expect(contact.owner_id).toBe('user-7')
    expect(contact.created_at).toBe('2023-04-01T00:00:00Z')
    expect(contact.updated_at).toBe('2023-10-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'crmcom-002' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('crmcom-002')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('builds name from first_name + last_name when name field is absent', () => {
    const raw = { id: 'crmcom-003', first_name: 'Omar', last_name: 'Farooq' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Omar Farooq')
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to CRM.COM shape', () => {
    const data = {
      first_name: 'Sara',
      last_name: 'Al-Maktoum',
      email: 'sara@example.ae',
      phone: '+971551234567',
      company_id: 'org-10',
    }
    const out = untransformContact(data)
    expect(out.first_name).toBe('Sara')
    expect(out.last_name).toBe('Al-Maktoum')
    expect(out.email).toBe('sara@example.ae')
    expect(out.phone).toBe('+971551234567')
    expect(out.company_id).toBe('org-10')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'crmcom-001',
      first_name: 'Layla',
      last_name: 'Al-Hassan',
      name: 'Layla Al-Hassan',
      email: 'layla@example.com',
      phone: '+971501234567',
      mobile: '+971509876543',
      company_id: 'org-42',
      owner_id: 'user-7',
      created_date: '2023-04-01T00:00:00Z',
      updated_date: '2023-10-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
