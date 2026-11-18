import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/qontak/transform/contact'
import { contactsList } from '../fixtures'

const doc = contactsList.response[0]

describe('qontak transformContact (documented GET /qontak/crm/contacts example)', () => {
  it('maps the documented fields and satisfies ContactSchema', () => {
    const c = ContactSchema.parse(transformContact(doc))
    expect(c.id).toBe('1')
    expect(c.first_name).toBe('John')
    expect(c.last_name).toBe('Smith')
    expect(c.title).toBe('CEO')
    expect(c.email).toBe('user1@example.com')
    expect(c.phone).toBe('08123456789')
    expect(c.stage).toBe('Status 1')
    expect(c.company_id).toBeUndefined()
    expect(c.created_at).toBe('2024-07-15T17:00:01.000Z')
    expect(c.updated_at).toBe('2024-07-15T17:00:02.000Z')
    expect(c.metadata).toEqual(doc)
  })

  it('maps crm_company_id when set', () => {
    expect(transformContact({ ...doc, crm_company_id: 7 }).company_id).toBe('7')
  })

  it('leaves blank text absent rather than empty', () => {
    const c = ContactSchema.parse(transformContact({ ...doc, email: '', telephone: '' }))
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
  })

  it('throws on a record with no id', () => {
    expect(() => transformContact({ ...doc, id: null as unknown as number })).toThrow(/no id/)
  })
})
