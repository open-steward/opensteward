/**
 * Gold-Vision ↔ canonical Company transforms.
 *
 * Gold-Vision surfaces companies under the `accounts` entity.
 *
 * Wire field reference (from /api/cosmos/accounts metadata):
 *   id              — unique record identifier (numeric string)
 *   summary         — display / company name
 *   website         — primary web domain
 *   phone           — main phone number
 *   industry        — industry label (lookup field)
 *   numberOfEmployees — approximate headcount
 *   ownerId         — assigned user id
 *   createdDate     — ISO 8601 creation timestamp
 *   modifiedDate    — ISO 8601 last-modified timestamp
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawGoldVisionAccount {
  id?: string | number
  summary?: string
  website?: string
  phone?: string
  industry?: string | { id?: string | number; summary?: string }
  numberOfEmployees?: string | number
  ownerId?: string | number
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function resolveLabel(
  field: string | { id?: string | number; summary?: string } | undefined,
): string | undefined {
  if (!field) return undefined
  if (typeof field === 'string') return field || undefined
  return field.summary ?? undefined
}

export function transformCompany(raw: RawGoldVisionAccount): Company {
  const empRaw =
    typeof raw.numberOfEmployees === 'number'
      ? raw.numberOfEmployees
      : raw.numberOfEmployees != null
        ? parseInt(String(raw.numberOfEmployees), 10)
        : undefined
  const size =
    empRaw != null && !isNaN(empRaw) ? empRaw : undefined

  return {
    id: String(raw.id ?? ''),
    name: raw.summary ?? '',
    domain: raw.website ?? undefined,
    phone: raw.phone ?? undefined,
    industry: resolveLabel(raw.industry),
    size,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(
  data: Partial<Company>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.summary = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.numberOfEmployees = data.size
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
