import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/zoho-bigin/transform/contact'

describe('zoho-bigin transformContact', () => {
  it('maps raw Bigin contact to canonical Contact', () => {
    const raw = {
      id: 'Z001',
      First_Name: 'Priya',
      Last_Name: 'Sharma',
      Email: 'priya@company.in',
      Phone: '+912012345678',
      Mobile: '+919876543210',
      Account_Name: { id: 'A001', name: 'TechCorp' },
      Owner: { id: 'O001', name: 'Admin' },
      Created_Time: '2024-01-15T10:00:00Z',
      Modified_Time: '2024-09-01T10:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('Z001')
    expect(contact.first_name).toBe('Priya')
    expect(contact.last_name).toBe('Sharma')
    expect(contact.name).toBe('Priya Sharma')
    expect(contact.email).toBe('priya@company.in')
    expect(contact.phone).toBe('+912012345678')
    expect(contact.mobile).toBe('+919876543210')
    expect(contact.company_id).toBe('A001')
    expect(contact.owner_id).toBe('O001')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing Account_Name and Owner', () => {
    const raw = { id: 'Z002', Account_Name: null, Owner: null }
    const contact = transformContact(raw)
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms Contact to Bigin payload', () => {
    const out = untransformContact({ first_name: 'Ravi', email: 'ravi@test.com' })
    expect(out['First_Name']).toBe('Ravi')
    expect(out['Email']).toBe('ravi@test.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'Z001',
      First_Name: 'Priya',
      Last_Name: 'Sharma',
      Email: 'priya@company.in',
      Phone: '+912012345678',
      Mobile: '+919876543210',
      Account_Name: { id: 'A001', name: 'TechCorp' },
      Owner: { id: 'O001', name: 'Admin' },
      Created_Time: '2024-01-15T10:00:00Z',
      Modified_Time: '2024-09-01T10:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
