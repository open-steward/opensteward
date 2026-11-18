/**
 * Transform Cloze company records to/from the canonical Company schema.
 *
 * Cloze company fields (from /v1/companies/find and /v1/companies/get):
 *   direct   — opaque identifier
 *   name     — company display name
 *   domains  — [string] list of known domains; first is treated as primary
 *   phones   — [{ value, ... }]
 *   stage    — lifecycle stage
 *   segment  — user-defined segment
 *   created  — ms epoch
 *   modified — ms epoch
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawClozeCompany {
  direct?: string
  id?: string
  name?: string
  domains?: string[]
  phones?: Array<{ value?: string; [key: string]: unknown }>
  stage?: string
  segment?: string
  created?: number | string
  modified?: number | string
  [key: string]: unknown
}

export function transformCompany(raw: RawClozeCompany): Company {
  const id = raw.direct ?? raw.id ?? ''
  const phone = raw.phones?.[0]?.value
  return {
    id: String(id),
    name: raw.name ?? '',
    domain: raw.domains?.[0],
    phone,
    created_at: toIsoDatetime(raw.created),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.domains = [data.domain]
  if (data.phone !== undefined) out.phones = [{ value: data.phone }]
  return out
}
