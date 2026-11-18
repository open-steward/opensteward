import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/contact'

describe('espocrm transformContact', () => {
  it('maps raw EspoCRM Contact to canonical Contact', () => {
    const raw = {
      id: 'espo-001',
      firstName: 'Hans',
      lastName: 'Müller',
      emailAddress: 'hans@example.de',
      phoneNumber: '+49123456789',
      phoneNumberData: [
        { phoneNumber: '+49123456789', primary: true, type: 'Office' },
        { phoneNumber: '+49987654321', primary: false, type: 'Mobile' },
      ],
      accountId: 'account-10',
      assignedUserId: 'user-3',
      createdAt: '2023-03-01 00:00:00',
      modifiedAt: '2023-09-01 00:00:00',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('espo-001')
    expect(contact.first_name).toBe('Hans')
    expect(contact.last_name).toBe('Müller')
    expect(contact.name).toBe('Hans Müller')
    expect(contact.email).toBe('hans@example.de')
    expect(contact.phone).toBe('+49123456789')
    expect(contact.mobile).toBe('+49987654321')
    expect(contact.company_id).toBe('account-10')
    expect(contact.owner_id).toBe('user-3')
    expect(contact.created_at).toBe('2023-03-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('has no mobile when phoneNumberData has no Mobile entry', () => {
    const contact = ContactSchema.parse(
      transformContact({
        id: 'espo-003',
        phoneNumberData: [{ phoneNumber: '+49123456789', primary: true, type: 'Office' }],
      }),
    )
    expect(contact.mobile).toBeUndefined()
  })

  it('throws rather than inventing an id', () => {
    expect(() => transformContact({})).toThrow(/Contact\.id/)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'espo-002' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('espo-002')
    expect(contact.email).toBeUndefined()
    expect(contact.company_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms canonical Contact to EspoCRM shape', () => {
    const data = {
      first_name: 'Lena',
      last_name: 'Schmidt',
      email: 'lena@example.de',
      phone: '+49111222333',
      company_id: 'account-20',
    }
    const out = untransformContact(data)
    expect(out.firstName).toBe('Lena')
    expect(out.lastName).toBe('Schmidt')
    expect(out.emailAddress).toBe('lena@example.de')
    expect(out.phoneNumber).toBe('+49111222333')
    expect(out.accountId).toBe('account-20')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'espo-001',
      firstName: 'Hans',
      lastName: 'Müller',
      emailAddress: 'hans@example.de',
      phoneNumber: '+49123456789',
      phoneNumberData: [
        { phoneNumber: '+49123456789', primary: true, type: 'Office' },
        { phoneNumber: '+49987654321', primary: false, type: 'Mobile' },
      ],
      accountId: 'account-10',
      assignedUserId: 'user-3',
      createdAt: '2023-03-01 00:00:00',
      modifiedAt: '2023-09-01 00:00:00',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
