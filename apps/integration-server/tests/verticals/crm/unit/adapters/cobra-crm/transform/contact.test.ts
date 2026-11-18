import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/cobra-crm/transform/contact'

describe('cobra-crm transformContact', () => {
  it('maps raw Cobra CRM contact to canonical Contact', () => {
    const raw = {
      id: 'C-001',
      firstName: 'Luc',
      lastName: 'Janssen',
      email: 'luc@bedrijf.be',
      phone: '+3225551234',
      mobile: '+32475123456',
      companyId: 'COMP-5',
      ownerId: 'USR-3',
      createdAt: '2024-05-01T00:00:00Z',
      updatedAt: '2024-11-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('C-001')
    expect(contact.first_name).toBe('Luc')
    expect(contact.last_name).toBe('Janssen')
    expect(contact.name).toBe('Luc Janssen')
    expect(contact.email).toBe('luc@bedrijf.be')
    expect(contact.phone).toBe('+3225551234')
    expect(contact.mobile).toBe('+32475123456')
    expect(contact.company_id).toBe('COMP-5')
    expect(contact.owner_id).toBe('USR-3')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null companyId and ownerId', () => {
    const raw = { id: 2, companyId: null, ownerId: null }
    const contact = transformContact(raw)
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms Contact to Cobra CRM payload', () => {
    const out = untransformContact({ first_name: 'Sophie', email: 'sophie@test.be' })
    expect(out['firstName']).toBe('Sophie')
    expect(out['email']).toBe('sophie@test.be')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'C-001',
      firstName: 'Luc',
      lastName: 'Janssen',
      email: 'luc@bedrijf.be',
      phone: '+3225551234',
      mobile: '+32475123456',
      companyId: 'COMP-5',
      ownerId: 'USR-3',
      createdAt: '2024-05-01T00:00:00Z',
      updatedAt: '2024-11-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
