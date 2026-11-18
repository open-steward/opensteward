import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShoperUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawShoperUser> = {}): RawShoperUser {
  return {
    user_id: 201,
    email: 'jan.kowalski@example.pl',
    firstname: 'Jan',
    lastname: 'Kowalski',
    phone: '+48123456789',
    newsletter: 1,
    orders_count: 5,
    address: {
      street: 'ul. Marszałkowska 100',
      apartment: 'lok. 3',
      postcode: '00-001',
      city: 'Warszawa',
      state: 'mazowieckie',
      country_code: 'PL',
    },
    add_date: '2022-06-15T00:00:00.000Z',
    edit_date: '2024-01-10T09:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformCustomer', () => {
  it('maps user_id to string id', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('201')
  })

  it('maps email, firstName, lastName', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('jan.kowalski@example.pl')
    expect(result.firstName).toBe('Jan')
    expect(result.lastName).toBe('Kowalski')
  })

  it('converts newsletter numeric 1 to acceptsMarketing true', () => {
    const result = transformCustomer(makeRaw())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('converts newsletter 0 to acceptsMarketing false', () => {
    const result = transformCustomer(makeRaw({ newsletter: 0 }))
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps address street → line1 and apartment → line2', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.line1).toBe('ul. Marszałkowska 100')
    expect(result.defaultAddress?.line2).toBe('lok. 3')
    expect(result.defaultAddress?.city).toBe('Warszawa')
    expect(result.defaultAddress?.postalCode).toBe('00-001')
    expect(result.defaultAddress?.country).toBe('PL')
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2022-06-15T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-10T09:00:00.000Z')
  })

  it('produces output that passes CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeRaw())
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('jan.kowalski@example.pl')
    expect(back.firstname).toBe('Jan')
    expect(back.newsletter).toBe(1)
  })
})
