import type { Deal } from '../../../schema/deal'

// TODO: verify endpoint field names from ACT! CRM REST API for opportunities
export interface RawActOpportunity {
  id?: string
  opportunityId?: string
  name?: string
  value?: number | null
  probability?: number | null
  status?: string | null
  stage?: string | null
  stageId?: string | null
  pipelineId?: string | null
  contactId?: string | null
  companyId?: string | null
  managerId?: string | null
  closeDate?: string | null
  created?: string | null
  edited?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawActOpportunity): Deal {
  const id = raw.id ?? raw.opportunityId ?? ''
  return {
    id: String(id),
    title: raw.name ?? '',
    value: raw.value != null
      ? { amount: raw.value, currency: 'USD' }
      : undefined,
    status: raw.status ?? undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    contact_ids: raw.contactId != null ? [String(raw.contactId)] : undefined,
    owner_id: raw.managerId != null ? String(raw.managerId) : undefined,
    close_date: raw.closeDate ?? undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.edited ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.owner_id !== undefined) out.managerId = data.owner_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
