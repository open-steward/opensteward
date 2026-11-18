import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/netsuite-crm/transform/contact'

describe('netsuite-crm transformContact', () => {
  it('maps raw NetSuite contact to canonical Contact', () => {
    const raw = {
      id: 'NS-001',
      firstName: 'David',
      lastName: 'Chen',
      email: 'david@enterprise.com',
      phone: '+14085551234',
      mobilePhone: '+14085559876',
      company: { id: 'CUST-100' },
      owner: { id: 'EMP-5' },
      dateCreated: '2024-01-20T00:00:00Z',
      lastModifiedDate: '2024-12-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('NS-001')
    expect(contact.first_name).toBe('David')
    expect(contact.last_name).toBe('Chen')
    expect(contact.name).toBe('David Chen')
    expect(contact.email).toBe('david@enterprise.com')
    expect(contact.phone).toBe('+14085551234')
    expect(contact.mobile).toBe('+14085559876')
    expect(contact.company_id).toBe('CUST-100')
    expect(contact.owner_id).toBe('EMP-5')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null company and owner', () => {
    const raw = { id: 100, company: null, owner: null }
    const contact = transformContact(raw)
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'NS-001',
      firstName: 'David',
      lastName: 'Chen',
      email: 'david@enterprise.com',
      phone: '+14085551234',
      mobilePhone: '+14085559876',
      company: { id: 'CUST-100' },
      owner: { id: 'EMP-5' },
      dateCreated: '2024-01-20T00:00:00Z',
      lastModifiedDate: '2024-12-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
