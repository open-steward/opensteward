/**
 * Shape verified against `components.schemas.Customer` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type KoronaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<KoronaCustomer> = {}): KoronaCustomer {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'jane@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
    phone: '+14155550101',
    marketingContactPermitted: true,
    createTime: '2024-01-01',
    address: {
      addressLine1: '123 Main St',
      city: 'San Francisco',
      zipCode: '94105',
      state: 'CA',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformCustomer (korona-pos)', () => {
  it('maps id, email, firstname, lastname directly — no nested billing address', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('22222222-2222-2222-2222-222222222222')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps marketingContactPermitted to acceptsMarketing', () => {
    expect(transformCustomer(makeRaw()).acceptsMarketing).toBe(true)
  })

  it('maps a real ISO country code', () => {
    expect(transformCustomer(makeRaw()).defaultAddress?.country).toBe('US')
  })

  it('omits country when it is not a real ISO 3166-1 alpha-2 code', () => {
    const result = transformCustomer(makeRaw({ address: { ...makeRaw().address, country: 'United States' } }))
    expect(result.defaultAddress?.country).toBeUndefined()
  })

  it('normalises the bare createTime date to strict ISO', () => {
    expect(transformCustomer(makeRaw()).createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeRaw()))).not.toThrow()
  })

  it('untransformCustomer writes the documented top-level + address fields', () => {
    const body = untransformCustomer(transformCustomer(makeRaw()))
    expect(body).toMatchObject({ email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe' })
    expect(body['address']).toMatchObject({ addressLine1: '123 Main St', city: 'San Francisco' })
  })
})
