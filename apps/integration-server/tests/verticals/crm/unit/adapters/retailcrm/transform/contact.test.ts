import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/retailcrm/transform/contact'

describe('retailcrm transformContact', () => {
  it('maps raw customer to canonical Contact', () => {
    const raw = { id: 101, firstName: 'Ivan', lastName: 'Petrov', email: 'ivan@example.ru', phones: [{ number: '+79001234567' }] }
    const contact = transformContact(raw)
    expect(contact.id).toBe('101')
    expect(contact.first_name).toBe('Ivan')
    expect(contact.last_name).toBe('Petrov')
    expect(contact.phone).toBe('+79001234567')
    expect(contact.metadata).toBe(raw)
  })

  it('builds name from first and last name', () => {
    const raw = { id: 1, firstName: 'Anna', lastName: 'Smirnova' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Anna Smirnova')
  })

  it('untransforms Contact to retailcrm payload', () => {
    const out = untransformContact({ first_name: 'Pavel', last_name: 'Ivanov', phone: '+79009999999' })
    expect(out['firstName']).toBe('Pavel')
    expect(out['lastName']).toBe('Ivanov')
    expect(out['phones']).toEqual([{ number: '+79009999999' }])
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 101, firstName: 'Ivan', lastName: 'Petrov', email: 'ivan@example.ru', phones: [{ number: '+79001234567' }] }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
