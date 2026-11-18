import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// ── PPL CZ raw customer/address types ────────────────────────────────────────

/**
 * One entry of GET /customer/address: the AddressModel documented at
 * https://ppl-cpl-api-en.apidog.io/customer-addresess-13601472e0.md
 * ("additionalProperties: false", so these are all its fields).
 *
 * The endpoint returns "a list of addresses stored for that customer": the
 * "primary headquarters address stored in the PPL system, as well as
 * additional branch offices or warehouses".
 */
export interface PplCzCustomerAddress {
  /**
   * "Short address identifier in the PPL system. It is an internal code that
   * is used when ordering shipments to make it clear which stored address it is."
   */
  code?: string | null
  /** "Name" */
  name?: string | null
  /** "Name2" */
  name2?: string | null
  /** "Street" */
  street?: string | null
  /** "City" */
  city?: string | null
  /** "Zip code" */
  zipCode?: string | null
  /** "Country code" (the docs' request examples use ISO alpha-2, e.g. "CZ") */
  country?: string | null
  /** "Determines whether the given address is marked as default." */
  default?: boolean
}

// ── Warehouse transform ───────────────────────────────────────────────────────

function transformCustomerAddress(raw: PplCzCustomerAddress): Address | undefined {
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.name2 ?? undefined,
    street1: raw.street ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.zipCode ?? undefined,
    // "Country code" is not documented as ISO 3166: keep it only when it is one.
    country: raw.country && isIso3166Alpha2(raw.country) ? raw.country : undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

/**
 * Transform a PPL CZ customer address (GET /customer/address) into a
 * canonical Warehouse: the account's registered sender addresses (head
 * office, branches, warehouses). The address `code` is the id, since it is
 * what getWarehouse looks an address up by.
 */
export function transformWarehouse(raw: PplCzCustomerAddress): Warehouse {
  return {
    id: raw.code ?? undefined,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: transformCustomerAddress(raw),
    metadata: { ...raw },
  }
}
