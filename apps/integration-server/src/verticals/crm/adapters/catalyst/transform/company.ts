/**
 * Catalyst account (company) transform.
 *
 * In Catalyst, "accounts" are the top-level objects that represent customer
 * organisations. They map to the canonical CRM `Company` resource.
 *
 * Catalyst API ref: https://help.catalyst.io/hc/en-us/articles/34021477455508-Catalyst-API-v1
 *
 * UNVERIFIED: the article documents the paths but not the account response
 * fields (the OpenAPI spec at https://app.catalyst.io/public-apis is behind a
 * login). Each canonical field reads one raw key, with no fallback chains.
 */

import type { Company } from '../../../schema/company'

export interface RawCatalystAccount {
  id: string | number
  name: string
  domain?: string
  phone?: string
  industry?: string
  employee_count?: number
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawCatalystAccount): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.domain ?? undefined,
    phone: raw.phone ?? undefined,
    industry: raw.industry ?? undefined,
    size: raw.employee_count != null ? Number(raw.employee_count) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.domain = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.employee_count = data.size
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
