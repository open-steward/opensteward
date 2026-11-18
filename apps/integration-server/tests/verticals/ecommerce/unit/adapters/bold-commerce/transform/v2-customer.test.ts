/**
 * Bold customer → Customer. Fixture: the documented v2Customer / v2Address
 * examples in https://developer.boldcommerce.com/api/customers.openapi.yaml.
 */
import { describe, it, expect } from 'vitest'
import {
  transformBoldCustomer,
  transformBoldAddress,
  type RawBoldAddress,
  type RawBoldCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/v2-customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

const address: RawBoldAddress = {
  id: 90235719,
  city: 'Winnipeg',
  province: 'Manitoba',
  province_code: 'MB',
  country: 'Canada',
  zip: 'R3L0L6',
  address_type: 'residential',
  address_use: 'shipping',
  company: 'Acme Inc.',
  street_1: '50 Fultz Blvd',
  street_2: 'Suite 200',
  first_name: 'John',
  last_name: 'Doe',
  phone: '2041438851',
  is_default: true,
  bold_customer_id: 1423294,
  country_iso2: 'CA',
}

const raw: RawBoldCustomer = {
  id: 142329453,
  shop_identifier: 'zp3oafdor9',
  platform_id: '1',
  platform_type: 'bigcommerce',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '2041438851',
  tags: 'member, 2021',
  platform_created_at: '2021-11-04T19:09:52Z',
  created_at: '2021-11-04T19:09:52Z',
  updated_at: '2021-11-04T19:09:52Z',
  deleted_at: null,
  addresses: [address],
  default_address: address,
}

const canonicalAddress = {
  line1: '50 Fultz Blvd',
  line2: 'Suite 200',
  city: 'Winnipeg',
  region: 'MB',
  postalCode: 'R3L0L6',
  country: 'CA',
}

describe('transformBoldCustomer (bold-commerce)', () => {
  it('maps the documented v2Customer and passes CustomerSchema', () => {
    const out = CustomerSchema.parse(transformBoldCustomer(raw))
    expect(out).toEqual({
      id: '142329453',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '2041438851',
      tags: ['member', '2021'],
      defaultAddress: canonicalAddress,
      addresses: [canonicalAddress],
      createdAt: '2021-11-04T19:09:52.000Z',
      updatedAt: '2021-11-04T19:09:52.000Z',
      metadata: raw,
    })
  })

  it('leaves out fields Bold did not send', () => {
    const out = CustomerSchema.parse(transformBoldCustomer({ id: 5, updated_at: null }))
    expect(out).toEqual({ id: '5', metadata: { id: 5, updated_at: null } })
  })

  it('drops a country that is not ISO 3166 alpha-2', () => {
    expect(transformBoldAddress({ city: 'Winnipeg', country_iso2: 'Canada' })).toEqual({
      city: 'Winnipeg',
    })
  })
})
