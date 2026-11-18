/**
 * Transforms between Simplicate CRM organization objects and the canonical Company schema.
 *
 * Simplicate organization fields (from /crm/organization):
 *   id          – "organization:xxxxxxxxxxxxxxxx"
 *   name        – display name
 *   email       – primary e-mail
 *   phone       – main phone
 *   url         – website URL / domain
 *   coc_code    – Chamber of Commerce registration number
 *   vat_number  – VAT / tax ID
 *   note        – free-text note
 *   created_at  – ISO 8601 datetime
 *   updated_at  – ISO 8601 datetime
 *
 * Docs: https://developer.simplicate.com/docs/api/v2/reference/get-crm-organization/
 */
import type { Company } from '../../../schema/company'

export interface RawSimplicateOrganization {
  id: string
  name?: string
  email?: string
  phone?: string
  url?: string
  coc_code?: string
  vat_number?: string
  note?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSimplicateOrganization): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone ?? undefined,
    // Strip protocol from URL to produce a bare domain string if possible
    domain: raw.url
      ? raw.url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
      : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.url = `https://${data.domain}`
  return out
}
