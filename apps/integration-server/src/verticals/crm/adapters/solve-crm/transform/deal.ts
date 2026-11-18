import type { Deal } from '../../../schema/deal'

// Solve360 calls deals "Projects"
export interface RawSolveProject {
  id?: string | number
  name?: string
  value?: number | null
  currency?: string | null
  status?: string | null
  stageId?: string | null
  pipelineId?: string | null
  organisation?: string | null
  contact?: string | null
  assignee?: string | null
  closeDate?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawSolveProject): Deal {
  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    value: raw.value != null
      ? { amount: raw.value, currency: raw.currency ?? 'USD' }
      : undefined,
    status: raw.status ?? undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    company_id: raw.organisation != null ? String(raw.organisation) : undefined,
    contact_ids: raw.contact != null ? [String(raw.contact)] : undefined,
    owner_id: raw.assignee != null ? String(raw.assignee) : undefined,
    close_date: raw.closeDate ?? undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.company_id !== undefined) out.organisation = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact = data.contact_ids[0]
  if (data.owner_id !== undefined) out.assignee = data.owner_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
