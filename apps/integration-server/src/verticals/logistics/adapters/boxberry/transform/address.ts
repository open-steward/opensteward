import type { Address } from '../../../schema/shared'

/**
 * Boxberry customer object shape (used inside orders and shipments).
 */
export interface BoxberryAddress {
  FIO?: string | null
  Phone?: string | null
  Email?: string | null
  Address?: string | null
  PostalCode?: string | null
  City?: string | null
  [key: string]: unknown
}

export function transformCustomerAddress(raw: BoxberryAddress): Address {
  return {
    name: raw.FIO ?? undefined,
    phone: raw.Phone ?? undefined,
    email: raw.Email ?? undefined,
    street1: raw.Address ?? undefined,
    postalCode: raw.PostalCode ?? undefined,
    city: raw.City ?? undefined,
  }
}
