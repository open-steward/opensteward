import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/deskera/transform/contact'

describe('deskera transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = { id: 'D-001', name: 'Wei Chen', email: 'wei@example.sg', mobileNumber: '+6591234567', organizationId: 'org-99' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('D-001')
    expect(contact.name).toBe('Wei Chen')
    expect(contact.mobile).toBe('+6591234567')
    expect(contact.company_id).toBe('org-99')
    expect(contact.metadata).toBe(raw)
  })

  it('maps phone and email', () => {
    const raw = { id: 'D-002', name: 'Li Na', email: 'lina@example.sg', phone: '+6591111111' }
    const contact = transformContact(raw)
    expect(contact.phone).toBe('+6591111111')
    expect(contact.email).toBe('lina@example.sg')
  })

  it('handles missing optional fields', () => {
    const raw = { id: 'D-003', name: 'Min' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('D-003')
    expect(contact.company_id).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'D-001', name: 'Wei Chen', email: 'wei@example.sg', mobileNumber: '+6591234567', organizationId: 'org-99' }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
