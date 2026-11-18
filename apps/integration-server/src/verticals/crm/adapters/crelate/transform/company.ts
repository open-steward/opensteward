/**
 * Crelate v3 company (`RetrieveCompanies`, the `Data` of GET /companies and
 * GET /companies/{id}) → canonical Company.
 *
 * From https://app.crelate.com/api3/docs/v3/crelate-openapi.json:
 *   Id        "The globally unique primary key of a record."
 *   Name      "The name of the Company."
 *   Domain    "Stores the canonical domain name for the company"
 *   PhoneNumbers_* "Collection of phone numbers for this Company (e.g., Main, Sales, Support)"
 *   Addresses_*    "Collection of physical addresses for this Company (e.g., Business address, Headquarters)"
 *   Owners    "The Crelate user, or users, who owns a record."
 *   CreatedOn / ModifiedOn — date-time.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import {
  primaryAddress,
  primaryOwnerId,
  primaryValue,
  requireId,
  toAddress,
  type CrelateAddress,
  type CrelateOwner,
  type CrelateValueField,
} from './contact'

export interface RawCrelateCompany {
  Id?: string | null
  Name?: string | null
  Domain?: string | null
  PhoneNumbers_Main?: CrelateValueField | null
  PhoneNumbers_Sales?: CrelateValueField | null
  PhoneNumbers_Support?: CrelateValueField | null
  PhoneNumbers_Other?: CrelateValueField | null
  Addresses_Business?: CrelateAddress | null
  Addresses_Headquarters?: CrelateAddress | null
  Addresses_Other?: CrelateAddress | null
  Owners?: CrelateOwner[] | null
  CreatedOn?: string | null
  ModifiedOn?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawCrelateCompany): Company {
  const address = toAddress(
    primaryAddress([raw.Addresses_Business, raw.Addresses_Headquarters, raw.Addresses_Other]),
  )
  return {
    id: requireId(raw, 'company'),
    name: raw.Name ?? '',
    domain: raw.Domain ?? undefined,
    phone: primaryValue([
      raw.PhoneNumbers_Main,
      raw.PhoneNumbers_Sales,
      raw.PhoneNumbers_Support,
      raw.PhoneNumbers_Other,
    ]),
    owner_id: primaryOwnerId(raw.Owners),
    address: address ?? undefined,
    created_at: toIsoDatetime(raw.CreatedOn),
    updated_at: toIsoDatetime(raw.ModifiedOn),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical → retired-v1 company body. Used only by the out-of-scope write
 * methods, which still target v1; kept as it was.
 */
export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone_main = { number: data.phone }
  if (data.address) {
    out.address_business = {
      line1: data.address.line1,
      city: data.address.city,
      state: data.address.region,
      zip_code: data.address.postalCode,
      country: data.address.country,
    }
  }
  return out
}
