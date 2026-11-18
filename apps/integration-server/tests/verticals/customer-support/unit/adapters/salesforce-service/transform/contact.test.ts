import { describe, it, expect } from 'vitest'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'
import { CONTACT } from '../fixtures'

describe('transformContact (Contact)', () => {
  it('maps name, email, phone and account, and parses as a Contact', () => {
    const c = ContactSchema.parse(transformContact(CONTACT))
    expect(c).toEqual({
      id: '003D000000QOVoIIAX',
      externalId: '003D000000QOVoIIAX',
      email: 'jane.doe@acme.example',
      name: 'Jane Doe',
      phone: '+14155550123',
      organizationId: '001D000000IRFmaIAH',
      platform: 'salesforce-service',
      metadata: { lastModifiedDate: '2026-01-10T09:00:00.000+0000' },
      raw: CONTACT,
    })
  })

  it('a contact with no email, phone or account still parses', () => {
    const c = ContactSchema.parse(
      transformContact({ ...CONTACT, Email: null, Phone: null, AccountId: null }),
    )
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
    expect(c.organizationId).toBeUndefined()
  })
})
