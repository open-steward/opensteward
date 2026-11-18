import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawDeskeraDeal {
  id: string | number
  title?: string
  amount?: number
  stageId?: string | number
  pipelineId?: string | number
  contactId?: string | number
  companyId?: string | number
  ownerId?: string | number
  closeDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawDeskeraDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    value: raw.amount != null ? { amount: raw.amount, currency: 'USD' } : undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    contact_ids: raw.contactId != null ? [String(raw.contactId)] : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    close_date: toIsoDatetime(raw.closeDate),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
