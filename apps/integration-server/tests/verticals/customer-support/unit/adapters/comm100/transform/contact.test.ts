import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/comm100/transform/contact'
import { DOC_CONTACT } from '../fixtures'

describe('comm100 transformContact', () => {
  it('maps the documented contact example, reading email and phone from its identities', () => {
    const c = ContactSchema.parse(transformContact(DOC_CONTACT))
    expect(c.id).toBe('6396ad99-6885-4489-ad95-43c923154a8c')
    expect(c.name).toBe('testContact')
    expect(c.email).toBe('testContact@gmail.com')
    expect(c.phone).toBe('+11111111')
    expect(c.metadata['createTime']).toBe('2022-09-02T04:12:40.000Z')
    expect(c.platform).toBe('comm100')
  })

  it('joins first and last name when name is empty', () => {
    const c = ContactSchema.parse(transformContact({ ...DOC_CONTACT, name: '' }))
    expect(c.name).toBe('Firstname for test Last name for test')
  })

  it('leaves email and phone out when the contact has no such identity', () => {
    const c = ContactSchema.parse(transformContact({ ...DOC_CONTACT, contactIdentities: [] }))
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
  })

  it('drops an Email identity the canonical schema would reject, keeping the rest of the row', () => {
    const [emailId, smsId] = DOC_CONTACT.contactIdentities
    const c = ContactSchema.parse(
      transformContact({
        ...DOC_CONTACT,
        contactIdentities: [{ ...emailId!, value: 'not-an-email' }, smsId!],
      }),
    )
    expect(c.email).toBeUndefined()
    expect(c.phone).toBe('+11111111')
  })
})
