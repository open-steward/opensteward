/**
 * Transform SYSPRO ApSupplier OData entity → canonical Supplier.
 *
 * SYSPRO OData entity: ApSupplier
 * Confirmed field names from SYSPRO 8 Supplier Maintenance docs:
 *   Supplier (code / key), Name, Email, Telephone, Currency,
 *   InvoiceTerms (payment terms code), TaxCode, EcVatCode,
 *   SupplierOnHold ('Y'/'N'), SupplierStatus (P=Permanent, T=Temporary)
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawSysproSupplier {
  /** Supplier code — primary key */
  Supplier: string
  Name?: string
  Email?: string
  Telephone?: string
  Currency?: string
  /** Default payment terms code, e.g. '30' or 'NET30' */
  InvoiceTerms?: string
  TaxCode?: string
  EcVatCode?: string
  /** 'Y' = on hold (restricted), 'N' = active */
  SupplierOnHold?: string
  /** 'P' = permanent, 'T' = temporary */
  SupplierStatus?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSysproSupplier): Supplier {
  const onHold = (raw.SupplierOnHold ?? 'N').toUpperCase() === 'Y'
  const isTemp  = (raw.SupplierStatus ?? 'P').toUpperCase() === 'T'
  const isActive = !onHold && !isTemp

  return {
    id: raw.Supplier,
    externalId: raw.Supplier,
    name: pickStr(raw.Name) ?? raw.Supplier,
    email: pickStr(raw.Email),
    phone: pickStr(raw.Telephone),
    defaultCurrency: pickStr(raw.Currency),
    defaultLeadTimeDays: undefined, // not available on ApSupplier entity
    isActive,
    platform: 'syspro',
    metadata: strMap({
      invoiceTerms:   raw.InvoiceTerms,
      taxCode:        raw.TaxCode,
      ecVatCode:      raw.EcVatCode,
      supplierOnHold: raw.SupplierOnHold,
      supplierStatus: raw.SupplierStatus,
    }),
    raw,
  }
}
