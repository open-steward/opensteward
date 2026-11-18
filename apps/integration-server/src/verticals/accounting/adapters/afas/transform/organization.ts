/**
 * AFAS Profit_Employers GetConnector → canonical Organization transform.
 *
 * Fields returned by Profit_Employers:
 *   EmId         — employer / company id
 *   EmName       — company name
 *   EmAddress    — street address
 *   EmPostalCode — postal code
 *   EmCity       — city
 *   EmCountryIso — ISO-3166-alpha-2 country code
 *   EmPhone      — main phone
 *   EmEmail      — main email
 *   EmCocNr      — Chamber of Commerce registration number (KvK)
 *   EmVatNr      — VAT number
 *   EmCurrency   — default currency
 */
import type { Organization } from '../../../schema/organization'

export interface AfasEmployer {
  EmId: string
  EmName: string
  EmAddress: string
  EmPostalCode: string
  EmCity: string
  EmCountryIso: string
  EmPhone: string
  EmEmail: string
  EmCocNr: string
  EmVatNr: string
  EmCurrency: string
  [key: string]: unknown
}

export function transformOrganization(raw: AfasEmployer): Organization {
  return {
    name: raw.EmName || undefined,
    legalName: raw.EmName || undefined,
    taxNumber: raw.EmVatNr || raw.EmCocNr || undefined,
    currency: raw.EmCurrency || undefined,
    address: {
      address1: raw.EmAddress || undefined,
      city: raw.EmCity || undefined,
      postalCode: raw.EmPostalCode || undefined,
      country: raw.EmCountryIso || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
