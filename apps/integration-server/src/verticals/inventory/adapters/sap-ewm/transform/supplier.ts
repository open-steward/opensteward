/**
 * SAP EWM supplier transform.
 *
 * Source: SAP S/4HANA Business Partner / Supplier OData v2 service (API_BUSINESS_PARTNER).
 * Entity set: A_Supplier (supplier-specific BP view)
 * Key field: Supplier (= vendor account number, max 10 chars)
 *
 * Supplier name and contact details live on A_BusinessPartner, reached via the
 * to_BusinessPartner navigation property on A_Supplier.
 * Use $expand=to_BusinessPartner to populate BusinessPartnerFullName, PhoneNumber, etc.
 *
 * NOTE: to_SupplierCompany expands per-company-code financials (reconciliation
 * account, payment terms, etc.) — it does NOT carry the supplier name.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/** Fields from A_BusinessPartner (populated via $expand=to_BusinessPartner). */
export interface RawSapEwmBusinessPartner {
  /** Full formatted name */
  BusinessPartnerFullName?: string
  /** Organisation name (legal name for companies) */
  OrganizationBPName1?: string
  /** First name (for individual persons) */
  FirstName?: string
  /** Last name (for individual persons) */
  LastName?: string
  /** ISO country code */
  Country?: string
  /** Language key */
  Language?: string
  [key: string]: unknown
}

export interface RawSapEwmSupplier {
  /** Vendor account number */
  Supplier: string
  /** Purchasing organisation */
  PurchasingOrganization?: string
  /** Account group */
  SupplierAccountGroup?: string
  /** Payment terms (from purchasing-org data; informational only) */
  PaymentTerms?: string
  /** Order currency */
  PurchaseOrderCurrency?: string
  /** Planned delivery time in days */
  PlannedDeliveryDurationInDays?: string | number
  /** Deletion flag */
  IsMarkedForDeletion?: boolean | string
  /**
   * Expanded from to_BusinessPartner (A_BusinessPartner entity).
   * This navigation property carries the BP's name, phone, email, and address.
   */
  to_BusinessPartner?: RawSapEwmBusinessPartner | { results?: RawSapEwmBusinessPartner[] }
  /**
   * Some SAP SDK integrations flatten to_BusinessPartner fields directly onto
   * the A_Supplier entity.  We support both shapes.
   */
  BusinessPartnerFullName?: string
  PhoneNumber?: string
  EmailAddress?: string
  Country?: string
  [key: string]: unknown
}

function extractBP(raw: RawSapEwmSupplier): RawSapEwmBusinessPartner {
  const nav = raw.to_BusinessPartner
  if (!nav) return {}
  // OData v2 single-entity navigation
  if (!Array.isArray(nav) && !('results' in nav)) return nav as RawSapEwmBusinessPartner
  // Occasionally returned as a collection wrapper
  const r = (nav as { results?: RawSapEwmBusinessPartner[] }).results
  return r?.[0] ?? {}
}

export function transformSupplier(raw: RawSapEwmSupplier): Supplier {
  const bp = extractBP(raw)

  // Prefer the expanded BP name; fall back to flat fields or the supplier number.
  const name =
    pickStr(bp.BusinessPartnerFullName) ??
    pickStr(bp.OrganizationBPName1) ??
    (bp.FirstName || bp.LastName
      ? [bp.FirstName, bp.LastName].filter(Boolean).join(' ')
      : undefined) ??
    pickStr(raw.BusinessPartnerFullName) ??
    raw.Supplier

  const phone = pickStr(bp.PhoneNumber as string | undefined) ?? pickStr(raw.PhoneNumber)
  const email = pickStr(raw.EmailAddress)
  const country = pickStr(bp.Country as string | undefined) ?? pickStr(raw.Country)

  return {
    id: raw.Supplier,
    externalId: raw.Supplier,
    name,
    email,
    phone,
    defaultCurrency: pickStr(raw.PurchaseOrderCurrency),
    defaultLeadTimeDays: pickNum(raw.PlannedDeliveryDurationInDays),
    isActive: !(raw.IsMarkedForDeletion === true || raw.IsMarkedForDeletion === 'X'),
    platform: 'sap-ewm',
    metadata: strMap({
      purchasingOrganization: raw.PurchasingOrganization,
      supplierAccountGroup: raw.SupplierAccountGroup,
      paymentTerms: raw.PaymentTerms,
      country,
    }),
    raw,
  }
}
