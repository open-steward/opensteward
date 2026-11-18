import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

/**
 * A Webshipper Shipping Address (https://docs.webshipper.io/, "Shipping
 * Address", `GET /v2/shipping_addresses`). The adapter's warehouses are the
 * account's ship-from addresses: `address_type` "sender" ("This will be one
 * of the following: recipient, sender, sold_from, pickup, return,
 * order_address").
 */
export interface WebshipperShippingAddressAttributes {
  att_contact?: string | null
  company_name?: string | null
  address_1?: string | null
  address_2?: string | null
  /** "ISO 3166-1 alpha-2 code" */
  country_code?: string | null
  state?: string | null
  phone?: string | null
  email?: string | null
  zip?: string | null
  city?: string | null
  vat_no?: string | null
  address_type?: string | null
  /** 1.1 Conventions: "All resources have the attributes created_at and updated_at" */
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface WebshipperShippingAddress {
  id?: string | number | null
  type?: string
  attributes?: WebshipperShippingAddressAttributes | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformWarehouse(raw: WebshipperShippingAddress): Warehouse {
  if (raw.id == null || raw.id === '') {
    throw new Error('Webshipper shipping address has no id')
  }
  const attrs = raw.attributes ?? {}

  return {
    id: String(raw.id),
    name: attrs.company_name ?? undefined,
    address: toAddress({
      name: attrs.att_contact,
      company_name: attrs.company_name,
      address1: attrs.address_1,
      address2: attrs.address_2,
      zip: attrs.zip,
      city: attrs.city,
      state: attrs.state,
      country_code: attrs.country_code,
      email: attrs.email,
      phone: attrs.phone,
    }),
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
