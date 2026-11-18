import type { Supplier } from '../../../schema/supplier'
import { SupplierSchema } from '../../../schema/supplier'
import { pickBool, pickStr, requireId, strMap } from './shared'

/**
 * Erplain v2 `Supplier`, as selected by SUPPLIER_FIELDS in ../index.ts.
 *
 * https://erplain.readme.io/v2.0/reference/suppliers-queries, "Available fields":
 *   id              Int      "Unique identifier for the supplier."
 *   label           String   "Supplier name or company name."
 *   email           String   "Primary contact email."
 *   phone           String   "Primary contact phone number."
 *   active          Boolean  "Activation status."
 *   supplier_number String   "Internal reference number."
 *   currency        Currency "Procurement currency."
 * and `Currency.label`, "Name of the currency (USD, GBP, ...)."
 * (https://erplain.readme.io/v2.0/reference/currencies-queries).
 */
export interface RawErplainSupplier {
  id: number | string
  label?: string | null
  email?: string | null
  phone?: string | null
  active?: boolean | number | null
  supplier_number?: string | null
  currency?: { label?: string | null } | null
}

export function transformSupplier(raw: RawErplainSupplier): Supplier {
  const id = requireId(raw.id, 'supplier')
  const active = pickBool(raw.active)
  if (active === undefined) throw new Error(`erplain supplier ${id} has no active flag`)
  // The email is free text upstream; one that is not an address is left out.
  const email = SupplierSchema.shape.email.safeParse(pickStr(raw.email))
  return {
    id,
    externalId: id,
    name: pickStr(raw.label) ?? '',
    email: email.success ? email.data : undefined,
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.currency?.label),
    isActive: active,
    platform: 'erplain',
    metadata: strMap({ supplier_number: raw.supplier_number }),
    raw,
  }
}
