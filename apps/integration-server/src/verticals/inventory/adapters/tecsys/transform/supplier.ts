/**
 * Transform a raw Tecsys OrderDynamics supplier/vendor response into the
 * canonical Supplier schema.
 *
 * OrderDynamics does not expose a dedicated supplier list endpoint in its
 * public portal; supplier data is typically embedded in item and PO responses.
 * We map the common fields returned by PO and item vendor sub-objects.
 *
 * Expected fields follow the pattern seen in the OrderDynamics PO vendor block.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, pickBool, strMap} from './shared'

export interface RawTecsysSupplier {
  /** Unique identifier for this supplier (internal vendor code). */
  VendorId: string
  /** Display name of the supplier/vendor. */
  VendorName?: string
  /** Contact email address. */
  Email?: string
  /** Contact phone number. */
  Phone?: string
  /** ISO 4217 default currency code for this supplier. */
  Currency?: string
  /** Typical lead time in calendar days. */
  LeadTimeDays?: number | string
  /** Vendor status string ("Active", "Inactive", etc.). */
  Status?: string
  /** Whether this vendor record is active. */
  IsActive?: boolean | string | number
  [key: string]: unknown
}

export function transformSupplier(raw: RawTecsysSupplier): Supplier {
  const isActive =
    pickBool(raw.IsActive) ?? (raw.Status ?? '').toLowerCase() !== 'inactive'

  return {
    id: raw.VendorId,
    externalId: raw.VendorId,
    name: pickStr(raw.VendorName) ?? '',
    email: pickStr(raw.Email),
    phone: pickStr(raw.Phone),
    defaultCurrency: pickStr(raw.Currency),
    defaultLeadTimeDays: pickNum(raw.LeadTimeDays),
    isActive,
    platform: 'tecsys',
    metadata: strMap({ status: raw.Status }),
    raw,
  }
}
