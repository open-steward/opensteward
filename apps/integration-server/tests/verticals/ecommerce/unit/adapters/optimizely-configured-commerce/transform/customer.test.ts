/**
 * Optimizely Configured Commerce `transformCustomer` / `untransformCustomer`
 * — maps the Storefront v1 AccountModel (returned bare by `GET`/`PATCH
 * /api/v1/accounts/{id}`) to/from the canonical Customer shape. Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/accountsv1_getcollectionasync
 * https://docs.developers.optimizely.com/configured-commerce/reference/accountsv1_patchasync
 */
import { describe, it, expect } from 'vitest'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import {
  transformCustomer,
  untransformCustomer,
  type RawOptimizelyAccount,
} from '../../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/transform/customer'

describe('Optimizely transformCustomer', () => {
  it('produces output that satisfies the canonical Customer schema', () => {
    const out = transformCustomer({
      id: 'acc-1',
      email: 'jane.doe@acme.example',
      firstName: 'Jane',
      lastName: 'Doe',
    })
    expect(() => CustomerSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    expect(() => CustomerSchema.parse(transformCustomer({ id: 'min' }))).not.toThrow()
  })

  it('strips password and accessToken from metadata so secrets never persist there', () => {
    const raw: RawOptimizelyAccount = {
      id: '1',
      password: 'super-secret',
      accessToken: 'tok_leak',
      email: 'x@example.com',
    }
    const out = transformCustomer(raw)
    expect(out.metadata['password']).toBeUndefined()
    expect(out.metadata['accessToken']).toBeUndefined()
    expect(out.metadata['email']).toBe('x@example.com')
  })

  it('omits email rather than an empty string', () => {
    expect(transformCustomer({ id: '2', email: '' }).email).toBeUndefined()
  })
})

describe('Optimizely untransformCustomer', () => {
  it('maps email/firstName/lastName — never userName/password (create needs neither field)', () => {
    const body = untransformCustomer({ email: 'a@b.com', firstName: 'A', lastName: 'B' })
    expect(body).toEqual({ email: 'a@b.com', firstName: 'A', lastName: 'B' })
    expect(body['userName']).toBeUndefined()
    expect(body['password']).toBeUndefined()
  })

  it('omits fields that were not provided rather than sending them as undefined/null', () => {
    expect(untransformCustomer({ firstName: 'A' })).toEqual({ firstName: 'A' })
    expect(untransformCustomer({})).toEqual({})
  })
})
