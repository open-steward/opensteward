/**
 * Transform the Abacus ERP company/mandant record to the canonical Organization schema.
 *
 * Abacus exposes company (Mandant) information through the OData entity set
 * "Mandants" or "Companies". Each Abacus instance can host multiple mandants.
 *
 * Key Abacus mandant fields:
 *   Id              – numeric mandant number
 *   Name            – company trading name
 *   LegalName       – full legal name
 *   VatNumber       – VAT / UID registration number
 *   Street          – address line 1
 *   ZipCode         – postal code
 *   City            – city
 *   CountryCode     – ISO 3166-1 alpha-2
 *   CurrencyCode    – default ISO 4217 currency
 *   Timezone        – IANA timezone identifier
 *   Website         – company URL
 *   FiscalYearEnd   – e.g. "12" for December
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Organization } from '../../../schema/organization'

// ── Abacus payload type ───────────────────────────────────────────────────────

export interface AbacusMandant {
  Id?: string | number
  Name?: string
  LegalName?: string
  VatNumber?: string
  Street?: string
  Street2?: string
  City?: string
  ZipCode?: string
  CountryCode?: string
  CurrencyCode?: string
  Timezone?: string
  Website?: string
  FiscalYearEnd?: string | number   // Month number 1–12
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus mandant OData record to the canonical Organization type. */
export function transformOrganization(raw: AbacusMandant): Organization {
  const fiscalYearEnd =
    raw.FiscalYearEnd != null ? Number(raw.FiscalYearEnd) : undefined
  const hasAddress = raw.Street || raw.City || raw.ZipCode || raw.CountryCode

  return {
    id: raw.Id != null ? String(raw.Id) : undefined,
    name: raw.Name || undefined,
    legalName: raw.LegalName || undefined,
    taxNumber: raw.VatNumber || undefined,
    currency: raw.CurrencyCode || undefined,
    timezone: raw.Timezone || undefined,
    website: raw.Website || undefined,
    fiscalYearEndMonth:
      fiscalYearEnd != null && fiscalYearEnd >= 1 && fiscalYearEnd <= 12
        ? fiscalYearEnd
        : undefined,
    address: hasAddress
      ? {
          address1: raw.Street || undefined,
          address2: raw.Street2 || undefined,
          city: raw.City || undefined,
          postalCode: raw.ZipCode || undefined,
          country: raw.CountryCode || undefined,
        }
      : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
