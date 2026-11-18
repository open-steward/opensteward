import type { Deal } from '../../../schema/deal'

// TODO: verify field names against Cobra CRM API docs (German/Dutch language)
export interface RawCobraCrmDeal {
  id: string | number
  title?: string
  value?: number | null
  currency?: string
  status?: string
  stageId?: string | number | null
  pipelineId?: string | number | null
  contactId?: string | number | null
  companyId?: string | number | null
  ownerId?: string | number | null
  closeDate?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawCobraCrmDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    value: raw.value != null ? { amount: raw.value, currency: raw.currency ?? 'EUR' } : undefined,
    status: raw.status ?? undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    contact_ids: raw.contactId != null ? [String(raw.contactId)] : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    close_date: raw.closeDate ?? undefined,
    created_at: raw.createdAt ?? undefined,
    updated_at: raw.updatedAt ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
