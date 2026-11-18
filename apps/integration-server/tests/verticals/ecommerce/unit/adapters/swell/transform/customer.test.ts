/**
 * Swell account transform, against "The account model" example
 * (https://developers.swell.is/backend-api/accounts).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawSwellAccount,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

const DOC_ACCOUNT: RawSwellAccount = {
  id: '60f1994f9111e70000000001',
  email: 'lachance@darkbrotherhood.com',
  balance: 50,
  billing: {
    name: 'Lucien Lachance',
    first_name: 'Lucien',
    last_name: 'Lechance',
    address1: 'Abandoned House',
    city: 'Cheydinhal',
    state: 'NY',
    zip: 11201,
    country: 'US',
    phone: '(555) 555-5555',
    method: 'card',
  },
  cart_abandoned_count: 18,
  currency: 'USD',
  date_created: '2021-07-16T14:35:59.938Z',
  date_updated: '2021-07-16T14:35:59.938Z',
  first_name: 'Lucien',
  group: 'vip',
  last_name: 'Lechance',
  name: 'Lucien Lechance',
  order_value: 5,
  phone: '(555) 555-5555',
  shipping: {
    name: 'Lucien Lachance',
    first_name: 'Lucien',
    last_name: 'Lechance',
    address1: 'Abandoned House',
    city: 'Cheydinhal',
    state: 'NY',
    zip: 11201,
    country: 'US',
    phone: '(555) 555-5555',
    account_address_id: '5c12c5fdfcd74b34e19cf659',
  },
  type: 'individual',
}

describe('swell transformCustomer', () => {
  it('maps the documented account example and parses as a Customer', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_ACCOUNT))
    expect(c.id).toBe('60f1994f9111e70000000001')
    expect(c.email).toBe('lachance@darkbrotherhood.com')
    expect(c.firstName).toBe('Lucien')
    expect(c.lastName).toBe('Lechance')
    expect(c.phone).toBe('(555) 555-5555')
    expect(c.totalSpent).toEqual({ amount: 500, currency: 'USD' })
    // The documented zip is a number.
    expect(c.defaultAddress).toEqual({
      line1: 'Abandoned House',
      line2: undefined,
      city: 'Cheydinhal',
      region: 'NY',
      postalCode: '11201',
      country: 'US',
    })
    expect(c.addresses).toHaveLength(2)
    expect(c.createdAt).toBe('2021-07-16T14:35:59.938Z')
  })

  it('omits totalSpent without a currency and maps email_optin', () => {
    const c = CustomerSchema.parse(
      transformCustomer({ ...DOC_ACCOUNT, currency: null, email_optin: true, order_count: 3 }),
    )
    expect(c.totalSpent).toBeUndefined()
    expect(c.acceptsMarketing).toBe(true)
    expect(c.ordersCount).toBe(3)
  })
})
