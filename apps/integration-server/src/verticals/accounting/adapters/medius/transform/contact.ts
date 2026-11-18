/**
 * Medius supplier → canonical Contact.
 *
 * Endpoint: GET /integration/masterdata/v1/suppliers
 * Response body: SupplierExportPageDto  { suppliers: SupplierDto[], offset, limit, total }
 *
 * SupplierDto key fields:
 *   name, supplierId, currencyCode, companyId, companyName,
 *   streetAddress, zip, city, country, state,
 *   email, telephone, homepage
 *   mediusFlowSystemId, globalId
 *
 * All suppliers in Medius are AP vendors (isSupplier = true).
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Raw Medius types ───────────────────────────────────────────────────────────

export interface MediusSupplierIdentifier {
  type: string
  value: string
}

export interface MediusSupplier {
  name?: string
  supplierId?: string
  currencyCode?: string
  paymentTermId?: string
  taxIndicator1?: string
  taxIndicator2?: string
  companyId?: string
  companyName?: string
  streetAddress?: string
  zip?: string
  city?: string
  country?: string
  state?: string
  email?: string
  telephone?: string
  fax?: string
  homepage?: string
  mediusFlowSystemId?: string
  globalId?: string
  identifiers?: MediusSupplierIdentifier[]
  [key: string]: unknown
}

export interface MediusSupplierPage {
  suppliers: MediusSupplier[]
  offset: number
  limit: number
  total: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function strOrUndef(val: unknown): string | undefined {
  return typeof val === 'string' && val ? val : undefined
}

function mapAddress(raw: MediusSupplier): Address | undefined {
  if (!raw.streetAddress && !raw.city && !raw.zip && !raw.country) return undefined
  return {
    address1: strOrUndef(raw.streetAddress),
    city: strOrUndef(raw.city),
    region: strOrUndef(raw.state),
    postalCode: strOrUndef(raw.zip),
    country: strOrUndef(raw.country),
  }
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformSupplier(raw: MediusSupplier): Contact {
  const emailStr = strOrUndef(raw.email)
  const telStr = strOrUndef(raw.telephone)
  const emails: Email[] = emailStr ? [{ email: emailStr, type: 'WORK' }] : []
  const telephones: Telephone[] = telStr
    ? [{ telephone: telStr, type: 'WORK' }]
    : []

  return {
    // Use supplierId (ERP identifier) as the canonical id; fall back to Medius internal id
    id: strOrUndef(raw.supplierId) || strOrUndef(raw.mediusFlowSystemId) || strOrUndef(raw.globalId) || undefined,
    name: strOrUndef(raw.name),
    companyName: strOrUndef(raw.name),
    isCustomer: false,
    isSupplier: true,
    isActive: true,
    currency: strOrUndef(raw.currencyCode),
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(raw),
    metadata: raw as Record<string, unknown>,
  }
}
