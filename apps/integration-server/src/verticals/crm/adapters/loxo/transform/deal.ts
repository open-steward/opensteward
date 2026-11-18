import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

/**
 * Raw Loxo deal response shape.
 */
export interface RawLoxoDeal {
  id: number | string
  name?: string
  amount?: number | string | null
  closes_at?: string | null
  workflow_id?: number | string | null
  pipeline_stage_id?: number | string | null
  pipeline_stage?: { id?: number | string; name?: string; [k: string]: unknown } | null
  company_id?: number | string | null
  person_id?: number | string | null
  job_id?: number | string | null
  owner_id?: number | string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawLoxoDeal): Deal {
  const amountRaw = raw.amount != null ? Number(raw.amount) : NaN
  const amount = !isNaN(amountRaw) ? amountRaw : undefined

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: amount !== undefined ? { amount, currency: 'USD' } : undefined,
    stage_id: raw.pipeline_stage_id != null ? String(raw.pipeline_stage_id) : undefined,
    stage: raw.pipeline_stage?.name ?? undefined,
    pipeline_id: raw.workflow_id != null ? String(raw.workflow_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    contact_ids: raw.person_id != null ? [String(raw.person_id)] : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    status: raw.status ?? undefined,
    close_date: toIsoDatetime(raw.closes_at),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.close_date !== undefined) out.closes_at = data.close_date
  if (data.pipeline_id !== undefined) out.workflow_id = data.pipeline_id
  if (data.stage_id !== undefined) out.pipeline_stage_id = data.stage_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.contact_ids?.[0] !== undefined) out.person_id = data.contact_ids[0]
  return out
}
