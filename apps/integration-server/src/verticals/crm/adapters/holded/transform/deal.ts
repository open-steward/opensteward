import type { Deal } from '../../../schema/deal'

export interface RawHoldedDeal {
  id: string
  name?: string
  amount?: number | null
  status?: string
  stageId?: string
  funnelId?: string
  contactId?: string
  companyId?: string
  created?: number
  updated?: number
  [key: string]: unknown
}

export function transformDeal(raw: RawHoldedDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.amount != null ? { amount: raw.amount, currency: 'EUR' } : undefined,
    status: raw.status,
    stage_id: raw.stageId,
    pipeline_id: raw.funnelId,
    contact_ids: raw.contactId ? [String(raw.contactId)] : undefined,
    company_id: raw.companyId ? String(raw.companyId) : undefined,
    created_at: raw.created ? new Date(raw.created * 1000).toISOString() : undefined,
    updated_at: raw.updated ? new Date(raw.updated * 1000).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) out.amount = data.value?.amount
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.funnelId = data.pipeline_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.company_id !== undefined) out.companyId = data.company_id
  return out
}
