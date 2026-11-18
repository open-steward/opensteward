/**
 * Billit account info → canonical Organization transform.
 *
 * Source endpoint: GET /v1/account/accountInformation
 *
 * Returns company name, VAT number, addresses, currency, and enabled features.
 * Docs: https://docs.billit.be/docs/create-new-companies
 */

import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── Billit wire types ─────────────────────────────────────────────────────────

export interface BillitAccountAddress {
  AddressType?: string
  Street?: string
  StreetNumber?: string
  Box?: string
  Zipcode?: string
  City?: string
  CountryCode?: string
  [key: string]: unknown
}

export interface BillitAccountInfo {
  CompanyID?: number
  Name?: string
  CommercialName?: string
  VATNumber?: string
  Currency?: string
  Language?: string
  Email?: string
  Phone?: string
  Website?: string
  Addresses?: BillitAccountAddress[]
  [key: string]: unknown
}

// ── Canonical transform ───────────────────────────────────────────────────────

export function transformOrganization(raw: BillitAccountInfo): Organization {
  const invoiceAddr = raw.Addresses?.find(
    (a) => (a.AddressType ?? '').toLowerCase() === 'invoiceaddress',
  )
  const street = invoiceAddr
    ? [invoiceAddr.Street, invoiceAddr.StreetNumber, invoiceAddr.Box].filter(Boolean).join(' ')
    : undefined

  return {
    id: raw.CompanyID != null ? String(raw.CompanyID) : undefined,
    name: raw.CommercialName || raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.VATNumber || undefined,
    currency: raw.Currency || undefined,
    address: toAddress({
      address1: street || undefined,
      city: invoiceAddr?.City,
      postalCode: invoiceAddr?.Zipcode,
      country: invoiceAddr?.CountryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
