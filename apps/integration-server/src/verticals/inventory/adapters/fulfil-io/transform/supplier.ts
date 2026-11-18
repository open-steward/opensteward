import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap, m2oName} from './shared'

/**
 * Fulfil party.party record filtered to supplier parties.
 *
 * A party in Fulfil represents a contact (customer, supplier, or both).
 * We read supplier=true parties here.
 */
export interface RawFulfilParty {
  /** Integer record id */
  id: number
  /** Display name */
  name?: string | null
  /** Email (contact mechanism) — flattened by API */
  email?: string | null
  /** Phone (contact mechanism) — flattened by API */
  phone?: string | null
  /** Whether this party is a supplier */
  supplier?: boolean
  /** Default purchase currency (Many2One) */
  supplier_currency?: [number, string] | null
  /** Supplier payment term (Many2One) */
  supplier_payment_term?: [number, string] | null
  /** Whether active */
  active?: boolean
  /** lang / locale */
  lang?: string | null
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for party.party (supplier view). */
export const SUPPLIER_FIELDS = [
  'id', 'name', 'email', 'phone', 'supplier', 'supplier_currency',
  'supplier_payment_term', 'active', 'create_date', 'write_date',
]

export function transformSupplier(raw: RawFulfilParty): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name ?? undefined) ?? '',
    email: pickStr(raw.email ?? undefined),
    phone: pickStr(raw.phone ?? undefined),
    defaultCurrency: m2oName(raw.supplier_currency) ?? undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'fulfil-io',
    metadata: strMap({
      paymentTerm: m2oName(raw.supplier_payment_term),
    }),
    raw,
  }
}
