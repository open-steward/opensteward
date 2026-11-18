import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/apptivo/transform/contact'

describe('apptivo transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = {
      customerId: 'cust-001',
      firstName: 'Alice',
      lastName: 'Smith',
      emailAddressList: [{ emailAddress: 'alice@example.com' }],
      phoneList: [{ phone: '555-0001', type: 'work' }, { phone: '555-0002', type: 'mobile' }],
      companyId: 'comp-5',
      assigneeId: 'user-3',
      createdDate: '2024-03-01T00:00:00Z',
      modifiedDate: '2024-07-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('cust-001')
    expect(contact.first_name).toBe('Alice')
    expect(contact.last_name).toBe('Smith')
    expect(contact.email).toBe('alice@example.com')
    expect(contact.phone).toBe('555-0001')
    expect(contact.mobile).toBe('555-0002')
    expect(contact.company_id).toBe('comp-5')
    expect(contact.owner_id).toBe('user-3')
    expect(contact.metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'x1', companyId: null, assigneeId: null }
    const contact = transformContact(raw)
    expect(contact.id).toBe('x1')
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      customerId: 'cust-001',
      firstName: 'Alice',
      lastName: 'Smith',
      emailAddressList: [{ emailAddress: 'alice@example.com' }],
      phoneList: [{ phone: '555-0001', type: 'work' }, { phone: '555-0002', type: 'mobile' }],
      companyId: 'comp-5',
      assigneeId: 'user-3',
      createdDate: '2024-03-01T00:00:00Z',
      modifiedDate: '2024-07-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
