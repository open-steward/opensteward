import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * One item of GET /crmRestApi/resources/{version}/accounts, reading only the
 * attributes of `accounts-item-response`
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-accounts-get.html).
 */
export interface RawOracleCxCompany {
  /** "The unique identifier of the account." */
  PartyId: number | string
  /** "The name of the account." */
  OrganizationName: string
  /** "The uniform resource locator or a website containing information about the organization." */
  URL?: string | null
  /** "The formatted phone number of the organization." */
  FormattedPhoneNumber?: string | null
  /** "The unique identifier of a valid employee resource who owns and manages the sales account." */
  OwnerPartyId?: number | string | null
  /** "The date when the record was created." */
  CreationDate?: string | null
  /** "The date when the record was last updated." */
  LastUpdateDate?: string | null
  [key: string]: unknown
}

/** Attributes requested with `fields=`, all named in `accounts-item-response`. */
export const COMPANY_FIELDS = [
  'PartyId',
  'OrganizationName',
  'URL',
  'FormattedPhoneNumber',
  'OwnerPartyId',
  'CreationDate',
  'LastUpdateDate',
].join(',')

/**
 * The canonical `domain` is a host name ("Primary web domain (e.g. `example.com`)"),
 * while Oracle's `URL` is "The uniform resource locator or a website containing
 * information about the organization", so it may carry a scheme and a path.
 * Only the host is kept; a value that does not parse as a URL is dropped.
 */
function domainOf(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const host = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname
    return host === '' ? undefined : host
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawOracleCxCompany): Company {
  return {
    id: String(raw.PartyId),
    name: raw.OrganizationName,
    domain: domainOf(raw.URL),
    phone: raw.FormattedPhoneNumber ?? undefined,
    owner_id: raw.OwnerPartyId != null ? String(raw.OwnerPartyId) : undefined,
    created_at: toIsoDatetime(raw.CreationDate),
    updated_at: toIsoDatetime(raw.LastUpdateDate),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.OrganizationName = data.name
  if (data.domain !== undefined) out.URL = data.domain
  if (data.phone !== undefined) out.PhoneNumber = data.phone
  if (data.owner_id !== undefined) out.OwnedByPartyId = data.owner_id
  return out
}
