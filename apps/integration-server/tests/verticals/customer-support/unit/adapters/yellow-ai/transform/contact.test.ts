import { describe, it, expect } from 'vitest'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/yellow-ai/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'
import { DOC_USER_DETAILS } from '../fixtures'

describe('transformContact (Get user details data)', () => {
  it('unwraps each documented { value } property and parses as a Contact', () => {
    const contact = ContactSchema.parse(transformContact(DOC_USER_DETAILS.data))
    expect(contact).toEqual({
      id: '12395',
      externalId: '12395',
      email: 'test@yellow.com',
      name: 'Rohit3',
      phone: '919876543211',
      platform: 'yellow-ai',
      metadata: {},
      raw: DOC_USER_DETAILS.data,
    })
  })

  it('does not copy geo properties (refused by the Contact schema)', () => {
    const contact = transformContact(DOC_USER_DETAILS.data)
    expect(JSON.stringify(contact.metadata)).not.toContain('IN')
  })

  // The docs give no firstName example value: 'Ana' is constructed by this test.
  const FIRST_NAME = { firstName: { value: 'Ana', propertyType: 'System' } }

  it('joins firstName and lastName in that order', () => {
    const contact = ContactSchema.parse(
      transformContact({ ...DOC_USER_DETAILS.data, ...FIRST_NAME }),
    )
    expect(contact.name).toBe('Ana Rohit3')
  })

  it('builds the name from firstName alone when lastName is absent', () => {
    const { lastName: _drop, ...rest } = DOC_USER_DETAILS.data
    const contact = ContactSchema.parse(transformContact({ ...rest, ...FIRST_NAME }))
    expect(contact.name).toBe('Ana')
  })

  it('throws when userId is missing rather than inventing an id', () => {
    const { userId: _drop, ...rest } = DOC_USER_DETAILS.data
    expect(() => transformContact(rest)).toThrow(/userId/)
  })
})
