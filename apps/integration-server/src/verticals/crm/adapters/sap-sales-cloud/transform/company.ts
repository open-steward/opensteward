/**
 * SAP Sales Cloud V2 — Account (Company) transform.
 *
 * SAP Sales Cloud V2 refers to companies as "accounts" in the REST API
 * (service: SalesSvcCloudV2_accountService).
 * Endpoint: GET /sap/c4c/api/v1/account-service/accounts
 *
 * Key fields:
 *   id               — system UUID
 *   name             — account display name
 *   phone            — main phone number
 *   industry         — industry category
 *   numberOfEmployees — headcount (integer)
 *   ownerId          — assigned owner UUID
 *   webSite          — primary website / domain
 *   createdAt        — ISO-8601 creation timestamp (may lack timezone offset)
 *   lastModifiedAt   — ISO-8601 last-modified timestamp (may lack timezone offset)
 */
import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSapAccount {
  id: string
  name?: string
  phone?: string
  industry?: string
  numberOfEmployees?: number | string
  ownerId?: string
  webSite?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSapAccount): Company {
  const sizeRaw = raw.numberOfEmployees
  let size: number | undefined
  if (sizeRaw != null) {
    const parsed = typeof sizeRaw === 'number' ? sizeRaw : parseInt(String(sizeRaw), 10)
    size = !isNaN(parsed) ? parsed : undefined
  }

  // Attempt to extract a clean domain from the website field
  let domain: string | undefined
  if (raw.webSite) {
    try {
      domain = new URL(raw.webSite).hostname.replace(/^www\./, '')
    } catch {
      domain = raw.webSite
    }
  }

  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain,
    phone: raw.phone ?? undefined,
    industry: raw.industry ?? undefined,
    size,
    owner_id: raw.ownerId ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.numberOfEmployees = data.size
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.domain !== undefined) out.webSite = data.domain
  return out
}
