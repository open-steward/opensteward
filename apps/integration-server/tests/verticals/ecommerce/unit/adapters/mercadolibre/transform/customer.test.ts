/**
 * transformCustomer, fed the documented buyer_id example response from
 * https://developers.mercadolibre.com.ar/en_us/customer-data-access
 * (GET shops/cda/customers?buyer_id=1080426219).
 */
import { describe, expect, it } from 'vitest'
import {
  transformCustomer,
  type RawMeliCdaCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

const DOC_ROW = {
  id: 2000005004071824,
  date_created: '2023-01-26T21:27:24.000+00:00',
  buyer: {
    id: 1080426219,
    person: { birthdate: '1987-05-26', first_name: 'Faulkner', gender: 'M', last_name: 'Hoover' },
    contact: { phone: '542661180352832', email: 'faulkner.hoover@example.net' },
    ms_seller_promotions: false,
  },
  paid_amount: 1150.0,
  currency_id: 'ARS',
} as unknown as RawMeliCdaCustomer

describe('Mercado Libre transformCustomer', () => {
  it('maps the documented example to a valid canonical Customer', () => {
    const c = CustomerSchema.parse(transformCustomer(DOC_ROW))
    expect(c.id).toBe('1080426219')
    expect(c.email).toBe('faulkner.hoover@example.net')
    expect(c.firstName).toBe('Faulkner')
    expect(c.lastName).toBe('Hoover')
    expect(c.phone).toBe('542661180352832')
    expect(c.createdAt).toBe(new Date('2023-01-26T21:27:24.000+00:00').toISOString())
  })
})
