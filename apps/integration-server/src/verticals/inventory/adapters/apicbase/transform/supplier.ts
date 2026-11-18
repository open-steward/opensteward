import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Apicbase supplier.
 *
 * List endpoint:   GET /api/v2/suppliers/
 * Detail endpoint: GET /api/v2/suppliers/{supplier_id}/
 *
 * Key fields (snake_case, v2 — note: "company_name" was renamed to "name" in v2):
 *   uid             — Apicbase internal UUID
 *   name            — supplier company name (v2 field; was company_name in v1)
 *   email           — contact email
 *   ordering_email  — separate ordering email
 *   phone           — phone number
 *   vat_number      — VAT / tax number
 */
export interface RawApicbaseSupplier {
  uid: string
  name?: string
  email?: string
  ordering_email?: string
  phone?: string
  vat_number?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawApicbaseSupplier): Supplier {
  return {
    id: raw.uid,
    externalId: raw.uid,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email ?? raw.ordering_email),
    phone: pickStr(raw.phone),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'apicbase',
    metadata: strMap({
      ordering_email: raw.ordering_email,
      vat_number: raw.vat_number,
    }),
    raw,
  }
}
