/**
 * Kinaxis Maestro Supplier → Supplier transform.
 *
 * The Maestro REST API represents vendors as "Supplier" records.
 * Key fields:
 *   id               — system UUID
 *   supplierName     — display name
 *   supplierCode     — short alphanumeric identifier
 *   status           — "Active" | "Inactive"
 *   email            — primary contact email
 *   phone            — primary phone number
 *   defaultCurrency  — ISO 4217 currency code (e.g. "USD")
 *   defaultLeadTime  — procurement lead time in days
 *   siteId           — supplying site (optional)
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawKinaxisSupplier {
  id: string
  supplierName?: string
  supplierCode?: string
  status?: string
  email?: string
  phone?: string
  defaultCurrency?: string
  /** Lead time in days. */
  defaultLeadTime?: number
  siteId?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawKinaxisSupplier): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.supplierName) ?? pickStr(raw.supplierCode) ?? raw.id,
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    defaultCurrency: pickStr(raw.defaultCurrency),
    defaultLeadTimeDays: pickNum(raw.defaultLeadTime),
    isActive: (raw.status ?? '').toLowerCase() !== 'inactive',
    platform: 'kinaxis',
    metadata: strMap({ status: raw.status, supplierCode: raw.supplierCode, siteId: raw.siteId }),
    raw,
  }
}
