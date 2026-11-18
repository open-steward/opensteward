import type { Deal } from '../../../schema/deal'

export interface RawWebcrmOpportunity {
  OpportunityId?: number
  OpportunityHeading?: string
  OpportunityValue?: number
  OpportunityCurrency?: string
  OpportunityStatus?: string
  PipelineStageId?: number
  PipelineId?: number
  OrganisationId?: number
  PersonId?: number
  OwnedBy?: number
  OpportunityExpectedClosingDate?: string
  OpportunityCreatedAt?: string
  OpportunityUpdatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawWebcrmOpportunity): Deal {
  return {
    id: String(raw.OpportunityId ?? ''),
    title: raw.OpportunityHeading ?? '',
    value: raw.OpportunityValue != null
      ? { amount: raw.OpportunityValue, currency: raw.OpportunityCurrency ?? 'EUR' }
      : undefined,
    status: raw.OpportunityStatus,
    stage_id: raw.PipelineStageId != null ? String(raw.PipelineStageId) : undefined,
    pipeline_id: raw.PipelineId != null ? String(raw.PipelineId) : undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    contact_ids: raw.PersonId != null ? [String(raw.PersonId)] : undefined,
    owner_id: raw.OwnedBy != null ? String(raw.OwnedBy) : undefined,
    close_date: raw.OpportunityExpectedClosingDate,
    created_at: raw.OpportunityCreatedAt,
    updated_at: raw.OpportunityUpdatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.OpportunityHeading = data.title
  if (data.value?.amount !== undefined) out.OpportunityValue = data.value.amount
  if (data.value?.currency !== undefined) out.OpportunityCurrency = data.value.currency
  if (data.status !== undefined) out.OpportunityStatus = data.status
  if (data.stage_id !== undefined) out.PipelineStageId = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.PipelineId = Number(data.pipeline_id)
  if (data.company_id !== undefined) out.OrganisationId = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.PersonId = Number(data.contact_ids[0])
  if (data.close_date !== undefined) out.OpportunityExpectedClosingDate = data.close_date
  return out
}
