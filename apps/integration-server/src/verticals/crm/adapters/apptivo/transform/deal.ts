import type { Deal } from '../../../schema/deal'

// TODO: verify endpoint field names from Apptivo /opportunity object
export interface RawApptivoOpportunity {
  opportunityId?: string
  id?: string
  name?: string
  dealValue?: number | null
  currency?: string | null
  status?: string | null
  stageId?: string | null
  pipelineId?: string | null
  customerId?: string | null
  contactIdList?: string[] | null
  assigneeId?: string | null
  closeDate?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawApptivoOpportunity): Deal {
  const id = raw.opportunityId ?? raw.id ?? ''
  return {
    id: String(id),
    title: raw.name ?? '',
    value: raw.dealValue != null
      ? { amount: raw.dealValue, currency: raw.currency ?? 'USD' }
      : undefined,
    status: raw.status ?? undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    company_id: raw.customerId != null ? String(raw.customerId) : undefined,
    contact_ids: raw.contactIdList?.map(String),
    owner_id: raw.assigneeId != null ? String(raw.assigneeId) : undefined,
    close_date: raw.closeDate ?? undefined,
    created_at: raw.createdDate ?? undefined,
    updated_at: raw.modifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.dealValue = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.company_id !== undefined) out.customerId = data.company_id
  if (data.contact_ids !== undefined) out.contactIdList = data.contact_ids
  if (data.owner_id !== undefined) out.assigneeId = data.owner_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
