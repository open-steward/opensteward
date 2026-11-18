import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/contact'

describe('suitecrm transformContact', () => {
  it('maps raw SuiteCRM Contact (flattened JSON:API) to canonical Contact', () => {
    const raw = {
      id: 'suite-contact-001',
      first_name: 'John',
      last_name: 'Doe',
      full_name: 'John Doe',
      email1: 'john.doe@example.com',
      phone_work: '+1234567890',
      phone_mobile: '+0987654321',
      account_id: 'suite-account-10',
      assigned_user_id: 'suite-user-5',
      date_entered: '2023-01-01T00:00:00Z',
      date_modified: '2023-07-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('suite-contact-001')
    expect(contact.first_name).toBe('John')
    expect(contact.last_name).toBe('Doe')
    expect(contact.name).toBe('John Doe')
    expect(contact.email).toBe('john.doe@example.com')
    expect(contact.phone).toBe('+1234567890')
    expect(contact.mobile).toBe('+0987654321')
    expect(contact.company_id).toBe('suite-account-10')
    expect(contact.owner_id).toBe('suite-user-5')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'suite-002' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('suite-002')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to SuiteCRM shape', () => {
    const data = {
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      phone: '+1555444333',
      company_id: 'account-99',
    }
    const out = untransformContact(data)
    expect(out.first_name).toBe('Jane')
    expect(out.last_name).toBe('Smith')
    expect(out.email1).toBe('jane@example.com')
    expect(out.phone_work).toBe('+1555444333')
    expect(out.account_id).toBe('account-99')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'suite-contact-001',
      first_name: 'John',
      last_name: 'Doe',
      full_name: 'John Doe',
      email1: 'john.doe@example.com',
      phone_work: '+1234567890',
      phone_mobile: '+0987654321',
      account_id: 'suite-account-10',
      assigned_user_id: 'suite-user-5',
      date_entered: '2023-01-01T00:00:00Z',
      date_modified: '2023-07-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
