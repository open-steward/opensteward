import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawPipedriveDeal {
  id: number
  title: string
  value?: number
  currency?: string
  status?: string
  stage_id?: number
  pipeline_id?: number
  person_id?: { value: number; name?: string } | null
  org_id?: { value: number; name?: string } | null
  user_id?: { id: number; name?: string } | null
  close_time?: string
  probability?: number
  add_time?: string
  update_time?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawPipedriveDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title,
    // Money needs both halves: no currency is invented for a bare value.
    value:
      raw.value != null && raw.currency ? { amount: raw.value, currency: raw.currency } : undefined,
    status: raw.status,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    contact_ids: raw.person_id?.value != null ? [String(raw.person_id.value)] : undefined,
    company_id: raw.org_id?.value != null ? String(raw.org_id.value) : undefined,
    owner_id: raw.user_id?.id != null ? String(raw.user_id.id) : undefined,
    close_date: toIsoDatetime(raw.close_time),
    probability: raw.probability,
    created_at: toIsoDatetime(raw.add_time),
    updated_at: toIsoDatetime(raw.update_time),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stage_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.pipeline_id = Number(data.pipeline_id)
  if (data.contact_ids?.[0] !== undefined) out.person_id = Number(data.contact_ids[0])
  if (data.company_id !== undefined) out.org_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.close_date !== undefined) out.close_time = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  return out
}

// ── API v2 ──────────────────────────────────────────────────────────────────

/**
 * A deal as `GET /api/v2/deals` and `GET /api/v2/deals/{id}` return it
 * (getDeals / getDeal in https://developers.pipedrive.com/docs/api/v2/openapi.yaml).
 * v2 replaces v1's nested `person_id: { value }`, `org_id: { value }` and
 * `user_id: { id }` with plain integers (`user_id` is now `owner_id`), and
 * returns timestamps in RFC 3339.
 */
export interface RawPipedriveV2Deal {
  /** "The ID of the deal" */
  id: number
  /** "The title of the deal" */
  title: string
  /** "The ID of the user who owns the deal" */
  owner_id?: number | null
  /** "The ID of the person linked to the deal" (nullable) */
  person_id?: number | null
  /** "The ID of the organization linked to the deal" (nullable) */
  org_id?: number | null
  /** "The ID of the pipeline associated with the deal" */
  pipeline_id?: number | null
  /** "The ID of the deal stage" */
  stage_id?: number | null
  /** "The value of the deal" */
  value?: number | null
  /** "The currency associated with the deal" */
  currency?: string | null
  /** "The creation date and time of the deal" */
  add_time?: string
  /** "The last updated date and time of the deal" (nullable) */
  update_time?: string | null
  /** "The status of the deal" — the list filter's enum is open, won, lost, deleted */
  status?: string
  /** "The success probability percentage of the deal" (nullable) */
  probability?: number | null
  /** "The date and time of closing the deal" (nullable) */
  close_time?: string | null
  /** "The expected close date of the deal" (nullable, format: date) */
  expected_close_date?: string | null
  [key: string]: unknown
}

export function transformDealV2(raw: RawPipedriveV2Deal): Deal {
  return {
    id: String(raw.id),
    title: raw.title,
    // Money needs both halves: no currency is invented for a bare value.
    value:
      raw.value != null && raw.currency ? { amount: raw.value, currency: raw.currency } : undefined,
    status: raw.status,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    contact_ids: raw.person_id != null ? [String(raw.person_id)] : undefined,
    company_id: raw.org_id != null ? String(raw.org_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    // The canonical field is "Expected or actual close date": the actual
    // `close_time` once the deal has closed, else its `expected_close_date`.
    close_date: toIsoDatetime(raw.close_time ?? raw.expected_close_date),
    probability: raw.probability ?? undefined,
    created_at: toIsoDatetime(raw.add_time),
    updated_at: toIsoDatetime(raw.update_time),
    metadata: raw,
  }
}
