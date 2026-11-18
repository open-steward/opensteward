import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceAccount,
  type RawLogicommerceAccount,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import { fixture } from '../fixtures/load'

const listed = fixture<{ ITEMS: RawLogicommerceAccount[] }>('accounts').ITEMS[0]!
const single = fixture<RawLogicommerceAccount>('account')

describe('transformLogicommerceAccount', () => {
  it.each([
    ['GET /accounts row', listed],
    ['GET /accounts/{id}', single],
  ])('maps the documented %s example to a valid canonical Customer', (_label, raw) => {
    const out = CustomerSchema.parse(transformLogicommerceAccount(raw))
    expect(out).toMatchObject({
      id: '123',
      firstName: 'string',
      lastName: 'string',
      phone: 'string',
      createdAt: '2019-08-24T14:15:22.000Z',
    })
    // The documented placeholder "string" is not an email address.
    expect(out.email).toBeUndefined()
    expect(out.metadata).toEqual(raw)
  })

  it('maps the master user email when it is an address', () => {
    const out = CustomerSchema.parse(
      transformLogicommerceAccount({ ...listed, MASTER: { EMAIL: 'jane@example.com' } }),
    )
    expect(out.email).toBe('jane@example.com')
  })
})
