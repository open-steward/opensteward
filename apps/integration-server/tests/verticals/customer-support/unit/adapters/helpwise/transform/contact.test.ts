import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/helpwise/transform/contact'
import { DOC_CONTACT, DOC_CONTACT_GET } from '../fixtures'

describe('helpwise transformContact', () => {
  it('maps the documented List Contact row', () => {
    const c = ContactSchema.parse(transformContact(DOC_CONTACT))
    expect(c.id).toBe('1')
    expect(c.externalId).toBe('1')
    expect(c.name).toBe('John Doe')
    expect(c.email).toBe('john.doe@saaslabs.co')
    expect(c.phone).toBeUndefined()
    expect(c.platform).toBe('helpwise')
    expect(c.metadata).toEqual({})
  })

  it('maps the documented Get Contact body', () => {
    const c = ContactSchema.parse(transformContact(DOC_CONTACT_GET))
    expect(c.id).toBe('17864809')
    expect(c.name).toBe('Ashroof')
    expect(c.email).toBe('ashroof@helpwise.io')
  })

  it('reads company, jobTitle and a string phone when present', () => {
    const c = ContactSchema.parse(
      transformContact({
        ...DOC_CONTACT,
        company: 'SaaS Labs',
        jobTitle: 'CTO',
        phones: ['+14155550123'],
      }),
    )
    expect(c.phone).toBe('+14155550123')
    expect(c.metadata).toEqual({ company: 'SaaS Labs', jobTitle: 'CTO' })
  })

  it('joins a non-empty middlename between firstname and lastname', () => {
    const c = ContactSchema.parse(transformContact({ ...DOC_CONTACT, middlename: 'Q' }))
    expect(c.name).toBe('John Q Doe')
  })

  it('throws on a contact with no id', () => {
    expect(() => transformContact({ ...DOC_CONTACT, id: undefined as unknown as number })).toThrow(
      /contact id/,
    )
  })
})
