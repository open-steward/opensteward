/**
 * Webshipper Shipping Address (address_type `sender`) -> canonical Warehouse.
 *
 * Field names are the documented Shipping Address attributes
 * (https://docs.webshipper.io/, "Shipping Address"): att_contact,
 * company_name, address_1, address_2, country_code ("ISO 3166-1 alpha-2
 * code"), state, phone, email, zip, city, vat_no, address_type, plus the
 * created_at / updated_at every resource carries (1.1 Conventions).
 *
 * The Shipping Address section has no example response, so makeRaw() takes
 * its VALUES from the docs' own examples only: the sender_address of the
 * OpenAPI "Create shipment with a shipping rate" example
 * (company_name: Webshipper ApS, att_contact: Thomas, address_1: Lyngbygade 8,
 * zip: '8600', city: Silkeborg), country_code DK from the delivery_address
 * examples, and the "created_at": "2018-04-04T12:49:36.000Z" /
 * "updated_at": "2018-04-10T11:08:48.000Z" pair from the docs' JSON examples.
 * address_2, state, phone and email have no documented example value; the
 * one test that maps them says so and uses placeholders.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type WebshipperShippingAddress,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<WebshipperShippingAddress> = {}): WebshipperShippingAddress {
  return {
    id: 12,
    type: 'shipping_addresses',
    attributes: {
      att_contact: 'Thomas',
      company_name: 'Webshipper ApS',
      address_1: 'Lyngbygade 8',
      zip: '8600',
      city: 'Silkeborg',
      country_code: 'DK',
      address_type: 'sender',
      created_at: '2018-04-04T12:49:36.000Z',
      updated_at: '2018-04-10T11:08:48.000Z',
    },
    ...overrides,
  }
}

describe('transformWarehouse (webshipper shipping_addresses)', () => {
  it('parses against WarehouseSchema', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeRaw()))).not.toThrow()
  })

  it('maps id, name and the documented address fields', () => {
    const wh = WarehouseSchema.parse(transformWarehouse(makeRaw()))
    expect(wh.id).toBe('12')
    expect(wh.name).toBe('Webshipper ApS')
    expect(wh.address).toEqual({
      name: 'Thomas',
      company: 'Webshipper ApS',
      street1: 'Lyngbygade 8',
      city: 'Silkeborg',
      postalCode: '8600',
      country: 'DK',
    })
  })

  it('maps address_2, state, phone and email (placeholder values: the docs give no example)', () => {
    const base = makeRaw()
    const wh = WarehouseSchema.parse(
      transformWarehouse({
        ...base,
        attributes: {
          ...base.attributes,
          address_2: 'placeholder-address-2',
          state: 'placeholder-state',
          phone: 'placeholder-phone',
          email: 'placeholder@example.invalid',
        },
      }),
    )
    expect(wh.address).toMatchObject({
      street2: 'placeholder-address-2',
      state: 'placeholder-state',
      phone: 'placeholder-phone',
      email: 'placeholder@example.invalid',
    })
  })

  it('maps created_at / updated_at to dates', () => {
    const wh = transformWarehouse(makeRaw())
    expect(wh.createdAt?.toISOString()).toBe('2018-04-04T12:49:36.000Z')
    expect(wh.updatedAt?.toISOString()).toBe('2018-04-10T11:08:48.000Z')
  })

  it('does not assert isActive, which Webshipper does not document', () => {
    expect(transformWarehouse(makeRaw()).isActive).toBeUndefined()
  })

  it('throws when the resource has no id instead of inventing one', () => {
    expect(() => transformWarehouse(makeRaw({ id: null }))).toThrow(/id/)
  })

  it('throws on an empty-string id instead of emitting Warehouse.id ""', () => {
    expect(() => transformWarehouse(makeRaw({ id: '' }))).toThrow(/id/)
  })

  it('keeps the raw resource in metadata', () => {
    const raw = makeRaw()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })
})
