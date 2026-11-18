import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { optionalId, requireId, requireString } from '../fields'

/**
 * GET /api/v1/leads and /api/v1/leads/{id}.
 * Fields from krayin/rest-api src/Http/Resources/V1/Lead/LeadResource.php:
 * id, title, description, lead_value, status, lost_reason, closed_at, user
 * (UserResource), person (PersonResource), lead_products, lead_source_id,
 * lead_type_id, lead_pipeline_id, lead_pipeline_stage_id, created_at,
 * updated_at, expected_close_date.
 *
 * Not mapped, kept in `metadata`:
 * - lead_value: the response carries no currency (documented example
 *   "$45,255,25"), so a canonical Money cannot be built without guessing one.
 * - status: documented only as "Lead Status", example 1, with no vocabulary.
 * - stage name and probability: LeadResource does not emit them.
 */
export interface RawKrayinLead {
  id?: number | string
  title?: string
  description?: string | null
  lead_value?: number | string | null
  status?: number | boolean | string | null
  lost_reason?: string | null
  closed_at?: string | null
  user?: { id?: number | string | null } | null
  person?: { id?: number | string | null } | null
  lead_source_id?: number | string | null
  lead_type_id?: number | string | null
  lead_pipeline_id?: number | string | null
  lead_pipeline_stage_id?: number | string | null
  expected_close_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawKrayinLead): Deal {
  const personId = optionalId(raw.person?.id)
  return {
    id: requireId(raw.id, 'lead'),
    title: requireString(raw.title, 'lead title'),
    stage_id: optionalId(raw.lead_pipeline_stage_id),
    pipeline_id: optionalId(raw.lead_pipeline_id),
    contact_ids: personId !== undefined ? [personId] : undefined,
    owner_id: optionalId(raw.user?.id),
    close_date: toIsoDatetime(raw.expected_close_date),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['title'] = data.title
  if (data.status !== undefined) out['status'] = data.status
  if (data.stage_id !== undefined) out['lead_pipeline_stage_id'] = data.stage_id
  if (data.pipeline_id !== undefined) out['lead_pipeline_id'] = data.pipeline_id
  if (data.value?.amount !== undefined) out['lead_value'] = data.value.amount
  if (data.contact_ids?.[0] !== undefined) out['person_id'] = data.contact_ids[0]
  if (data.company_id !== undefined) out['organization_id'] = data.company_id
  if (data.close_date !== undefined) out['expected_close_date'] = data.close_date
  if (data.probability !== undefined) out['probability'] = data.probability
  return out
}
