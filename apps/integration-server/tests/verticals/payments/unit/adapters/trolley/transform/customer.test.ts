/**
 * Fixture: the recipient in the "Retrieve a recipient" example response
 * (https://developers.trolley.com/api/), trimmed of the nested account and
 * address objects the transform does not read.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawTrolleyRecipient,
} from '../../../../../../../src/verticals/payments/adapters/trolley/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const DOC_RECIPIENT: RawTrolleyRecipient = {
  id: 'R-1a2B3c4D5e6F7g8H9i0J1k',
  referenceId: 'jsmith11@example.com',
  email: 'jsmith11@example.com',
  name: 'Richard Hendricks',
  lastName: 'Hendricks',
  firstName: 'Richard',
  type: 'individual',
  status: 'active',
  language: 'en',
  complianceStatus: 'verified',
  dob: null,
  updatedAt: '2017-03-20T19:06:40.937Z',
  createdAt: '2017-03-17T20:10:45.818Z',
  tags: [],
  passport: '',
  payoutMethod: 'bank-transfer',
  primaryCurrency: 'CAD',
}

describe('trolley transformCustomer', () => {
  it('maps the documented recipient', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_RECIPIENT))
    expect(c.id).toBe('R-1a2B3c4D5e6F7g8H9i0J1k')
    expect(c.externalId).toBe('R-1a2B3c4D5e6F7g8H9i0J1k')
    expect(c.email).toBe('jsmith11@example.com')
    expect(c.name).toBe('Richard Hendricks')
    expect(c.createdAt).toBe('2017-03-17T20:10:45.818Z')
    expect(c.updatedAt).toBe('2017-03-20T19:06:40.937Z')
    expect(c.gateway).toBe('trolley')
    expect(c.metadata).toEqual({
      referenceId: 'jsmith11@example.com',
      type: 'individual',
      status: 'active',
      complianceStatus: 'verified',
      payoutMethod: 'bank-transfer',
    })
  })

  it('omits an empty email rather than failing the schema', () => {
    const c = CustomerSchema.parse(transformCustomer({ ...DOC_RECIPIENT, email: '' }))
    expect(c.email).toBeUndefined()
  })

  it('throws on a recipient without an id', () => {
    expect(() => transformCustomer({ ...DOC_RECIPIENT, id: undefined })).toThrow(/no id/)
  })
})
