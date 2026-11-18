/**
 * Fixture from the documented Person definition
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject): `firstname`,
 * `lastname`, `name`, `phone` ("title: Direct phone"), `mobilephone`,
 * `email`, `position`, `company` ("type: integer"), plus the system
 * properties `_id`, `_createdtime` and `_timestamp`.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  type RawLimeCrmPerson,
} from '../../../../../../../src/verticals/crm/adapters/lime-crm/transform/contact'

const raw: RawLimeCrmPerson = {
  _id: 1100,
  _createdtime: '2024-01-15T09:00:00Z',
  _timestamp: '2024-02-01T10:30:00Z',
  firstname: 'Lars',
  lastname: 'Lindgren',
  // Deliberately not firstname + ' ' + lastname: `name` is its own field.
  name: 'Lars A. Lindgren',
  phone: '+46811111111',
  mobilephone: '+46702222222',
  email: 'lars@example.se',
  position: 'CFO',
  company: 1001,
}

describe('lime-crm transformContact', () => {
  it('maps the documented fields', () => {
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact.id).toBe('1100')
    expect(contact.first_name).toBe('Lars')
    expect(contact.last_name).toBe('Lindgren')
    expect(contact.name).toBe('Lars A. Lindgren')
    expect(contact.phone).toBe('+46811111111')
    expect(contact.mobile).toBe('+46702222222')
    expect(contact.email).toBe('lars@example.se')
    expect(contact.title).toBe('CFO')
    expect(contact.company_id).toBe('1001')
    expect(contact.created_at).toBe('2024-01-15T09:00:00.000Z')
    expect(contact.updated_at).toBe('2024-02-01T10:30:00.000Z')
    expect(contact.metadata).toEqual(raw)
  })

  it('a person without _id is an error, not the id "undefined"', () => {
    expect(() => transformContact({ firstname: 'A' } as unknown as RawLimeCrmPerson)).toThrow(/_id/)
  })

  it('a person with no company parses without company_id', () => {
    const contact = ContactSchema.parse(
      transformContact({ _id: 1102, firstname: 'A', company: null }),
    )
    expect(contact.id).toBe('1102')
    expect(contact.company_id).toBeUndefined()
  })
})
