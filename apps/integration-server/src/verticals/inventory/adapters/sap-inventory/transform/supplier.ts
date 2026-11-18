/**
 * Transform SAP API_BUSINESS_PARTNER A_Supplier entity → canonical Supplier.
 *
 * A_Supplier key field: Supplier (= BusinessPartner number)
 * Additional fields from the entity:
 *   SupplierIsBlockedForPosting, PaymentTerms, PurgDocCreationDate,
 *   AccountingClerk, DeletionIndicator
 *
 * Contact details come from the A_SupplierCompany / A_BusinessPartnerAddress
 * navigation properties.  We handle the common flattened shape that SDK
 * expansions produce.
 *
 * Reference: https://api.sap.com/api/API_BUSINESS_PARTNER/resource
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

/** Raw SAP A_Supplier entity (flattened from API_BUSINESS_PARTNER). */
export interface RawSapSupplier {
  /** Business Partner number — primary key */
  Supplier: string
  /** Supplier account group */
  SupplierAccountGroup?: string
  /** Posting block */
  SupplierIsBlockedForPosting?: boolean | string
  /** Deletion indicator */
  DeletionIndicator?: boolean | string
  /**
   * Expanded from to_SupplierCompany (per company-code data):
   *   PaymentTerms, Currency, etc.
   * We handle the flat shape that some SDK expands produce.
   */
  PaymentTerms?: string
  Currency?: string
  /** Expanded from to_SupplierPurchasingOrg */
  OverdelivTolrtdLmtRatioInPct?: string | number
  /** From expanded address nav-prop */
  PhoneNumber?: string
  EmailAddress?: string
  /** Business partner name (from A_BusinessPartner.BusinessPartnerFullName) */
  BusinessPartnerFullName?: string
  SupplierName?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSapSupplier): Supplier {
  const blocked = pickBool(raw.SupplierIsBlockedForPosting) ?? false
  const deleted = pickBool(raw.DeletionIndicator) ?? false

  const name =
    pickStr(raw.BusinessPartnerFullName) ??
    pickStr(raw.SupplierName) ??
    pickStr(raw.Supplier) ??
    ''

  return {
    id: raw.Supplier,
    externalId: raw.Supplier,
    name,
    email: pickStr(raw.EmailAddress),
    phone: pickStr(raw.PhoneNumber),
    defaultCurrency: pickStr(raw.Currency),
    defaultLeadTimeDays: undefined,
    isActive: !blocked && !deleted,
    platform: 'sap-inventory',
    metadata: strMap({
      supplierAccountGroup: raw.SupplierAccountGroup,
      paymentTerms: raw.PaymentTerms,
      isBlocked: raw.SupplierIsBlockedForPosting,
      deletionIndicator: raw.DeletionIndicator,
    }),
    raw,
  }
}
