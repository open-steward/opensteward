/**
 * Saasu File Identity → canonical Organization.
 *
 * GET FileIdentity "Returns a single File Identity Detail record" for the
 * `FileId` it is called with (https://api.saasu.com/Help/Api/GET-FileIdentity,
 * fetched 2026-09-29). The record carries no id of its own, so the file's
 * `FileId` is the organisation id.
 *
 *   Name ("File name used by the business in Saasu") → name
 *   FullLegalName ("Legal registered business name") → legalName
 *   BusinessIdentifier ("eg. ABN in Australia") → taxNumber
 *   CompanyIdentifier ("eg. ACN in Australia") → organizationCode
 *   CurrencyCode ("File base currency ... eg: AUD or USD") → currency
 *   Website → website
 *   FinancialYearEndMonth ("Financial year end (FYE) month for this file")
 *     → fiscalYearEndMonth, when it is a month 1–12
 *   Street, City, State, PostCode, Country ("See LookupData/Countries") → address
 *   CreatedDateUtc / LastModifiedDateUtc → createdAt / updatedAt
 */
import type { Organization } from '../../../schema/organization'
import { toAddress, toUtcDate } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface SaasuFileIdentity {
  CreatedDateUtc?: string | null
  LastModifiedDateUtc?: string | null
  Name?: string | null
  FullLegalName?: string | null
  TradingNameOrAlternativeBrandName?: string | null
  BusinessIdentifier?: string | null
  CompanyIdentifier?: string | null
  Website?: string | null
  Street?: string | null
  City?: string | null
  State?: string | null
  PostCode?: string | null
  Country?: string | null
  CurrencyCode?: string | null
  FinancialYearEndMonth?: number | null
  [key: string]: unknown
}

/** The canonical website is a URL; a bare host a user typed ("www.x.com") is left out. */
function absoluteUrl(v: string | null | undefined): string | undefined {
  if (!v || !/^https?:\/\//i.test(v.trim())) return undefined
  try {
    new URL(v.trim())
    return v.trim()
  } catch {
    return undefined
  }
}

export function transformOrganization(raw: SaasuFileIdentity, fileId: string): Organization {
  const fye = raw.FinancialYearEndMonth
  return {
    id: fileId,
    name: raw.Name || undefined,
    legalName: raw.FullLegalName || undefined,
    taxNumber: raw.BusinessIdentifier?.trim() || undefined,
    organizationCode: raw.CompanyIdentifier?.trim() || undefined,
    currency: raw.CurrencyCode || undefined,
    website: absoluteUrl(raw.Website),
    fiscalYearEndMonth:
      typeof fye === 'number' && Number.isInteger(fye) && fye >= 1 && fye <= 12 ? fye : undefined,
    address: toAddress({
      address1: raw.Street,
      city: raw.City,
      region: raw.State,
      postalCode: raw.PostCode,
      country: toIso3166Alpha2(raw.Country),
    }),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
