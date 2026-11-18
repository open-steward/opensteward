/**
 * ChurnZero Account ↔ canonical Company transform.
 *
 * ChurnZero Account fields from the REST API (OData v4):
 *   Id, ExternalId, Name, CrmId, BillingAddressCity, BillingAddressCountry,
 *   BillingAddressLine1, BillingAddressLine2, BillingAddressState, BillingAddressZip,
 *   ContactsCount, DirectParentAccountId, EndDate, IsActive, LicenseCount,
 *   NextRenewalDate, ObjectCreatedDate, ObjectLastModifiedDate, ParentAccountId,
 *   StartDate, Tags, TenureInDays, TotalContractAmount
 *
 * ChurnZero calls its top-level entity "Account" but it maps to the canonical Company.
 */
import type { Company } from '../../../schema/company'

export interface RawChurnZeroAccount {
  Id?: string | number
  ExternalId?: string
  Name?: string
  CrmId?: string
  BillingAddressCity?: string
  BillingAddressCountry?: string
  BillingAddressLine1?: string
  BillingAddressLine2?: string
  BillingAddressState?: string
  BillingAddressZip?: string
  ContactsCount?: number
  DirectParentAccountId?: string | number
  EndDate?: string
  IsActive?: boolean
  LicenseCount?: number
  NextRenewalDate?: string
  ObjectCreatedDate?: string
  ObjectLastModifiedDate?: string
  ParentAccountId?: string | number
  StartDate?: string
  Tags?: string[]
  TenureInDays?: number
  TotalContractAmount?: number
  [key: string]: unknown
}

export function transformCompany(raw: RawChurnZeroAccount): Company {
  const id = raw.Id != null ? String(raw.Id) : (raw.ExternalId ?? '')

  const hasAddress =
    raw.BillingAddressLine1 ||
    raw.BillingAddressCity ||
    raw.BillingAddressState ||
    raw.BillingAddressCountry ||
    raw.BillingAddressZip

  return {
    id,
    name: raw.Name ?? '',
    tags: Array.isArray(raw.Tags) && raw.Tags.length > 0 ? raw.Tags : undefined,
    address: hasAddress
      ? {
          line1: raw.BillingAddressLine1 ?? undefined,
          line2: raw.BillingAddressLine2 ?? undefined,
          city: raw.BillingAddressCity ?? undefined,
          region: raw.BillingAddressState ?? undefined,
          postalCode: raw.BillingAddressZip ?? undefined,
          country: raw.BillingAddressCountry ?? undefined,
        }
      : undefined,
    created_at: raw.ObjectCreatedDate ?? undefined,
    updated_at: raw.ObjectLastModifiedDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['Name'] = data.name
  if (data.address?.line1 !== undefined && data.address.line1 !== null) out['BillingAddressLine1'] = data.address.line1
  if (data.address?.line2 !== undefined && data.address.line2 !== null) out['BillingAddressLine2'] = data.address.line2
  if (data.address?.city !== undefined && data.address.city !== null) out['BillingAddressCity'] = data.address.city
  if (data.address?.region !== undefined && data.address.region !== null) out['BillingAddressState'] = data.address.region
  if (data.address?.country !== undefined && data.address.country !== null) out['BillingAddressCountry'] = data.address.country
  if (data.address?.postalCode !== undefined && data.address.postalCode !== null) out['BillingAddressZip'] = data.address.postalCode
  return out
}
