import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/leadsquared/transform/contact'

describe('leadsquared transformContact', () => {
  it('maps lead to canonical Contact', () => {
    const raw = { ProspectId: 'abc-123', FirstName: 'Ravi', LastName: 'Kumar', EmailAddress: 'ravi@example.in', Phone: '+911234567890' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('abc-123')
    expect(contact.first_name).toBe('Ravi')
    expect(contact.last_name).toBe('Kumar')
    expect(contact.email).toBe('ravi@example.in')
    expect(contact.metadata).toBe(raw)
  })

  it('maps name from first+last', () => {
    const raw = { ProspectId: 'x1', FirstName: 'Anita', LastName: 'Singh' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Anita Singh')
  })

  it('handles missing optional fields', () => {
    const raw = { ProspectId: 'min-1' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('min-1')
    expect(contact.email).toBeUndefined()
    expect(contact.phone).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { ProspectId: 'abc-123', FirstName: 'Ravi', LastName: 'Kumar', EmailAddress: 'ravi@example.in', Phone: '+911234567890' }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
