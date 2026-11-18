/**
 * Transform between Tribe CRM Activity_SalesOpportunity records and the
 * canonical CRM Deal schema.
 *
 * Tribe CRM wire fields (PascalCase):
 *   Id                  — unique identifier
 *   Subject             — opportunity title / name
 *   EstimatedAmount     — expected deal value (number)
 *   Phase               — current stage label
 *   PhaseId             — stage identifier
 *   PipelineId          — pipeline identifier
 *   RelationId          — linked relation (contact) identifier
 *   OrganisationId      — linked organisation (company) identifier
 *   OwnerId             — CRM user responsible for this record
 *   ExpectedOrderDate   — expected close date (ISO-8601)
 *   Status              — open / won / lost / expired
 *   OpportunityPercent  — probability 0–100
 *   CreatedOn           — ISO-8601 creation timestamp
 *   ModifiedOn          — ISO-8601 last-modified timestamp
 */
import type { Deal } from '../../../schema/deal'

export interface RawTribeCrmOpportunity {
  Id: string | number
  Subject?: string
  EstimatedAmount?: number | string | null
  Phase?: string
  PhaseId?: string | number | null
  PipelineId?: string | number | null
  RelationId?: string | number | null
  OrganisationId?: string | number | null
  OwnerId?: string | number | null
  ExpectedOrderDate?: string
  Status?: string
  OpportunityPercent?: number | string | null
  Currency?: string
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawTribeCrmOpportunity): Deal {
  const amount = raw.EstimatedAmount != null ? Number(raw.EstimatedAmount) : undefined
  const probability = raw.OpportunityPercent != null ? Number(raw.OpportunityPercent) : undefined

  return {
    id: String(raw.Id),
    title: raw.Subject ?? '',
    value: amount != null && !isNaN(amount)
      ? { amount, currency: (raw.Currency as string | undefined) ?? 'EUR' }
      : undefined,
    status: raw.Status ?? undefined,
    stage: raw.Phase ?? undefined,
    stage_id: raw.PhaseId != null ? String(raw.PhaseId) : undefined,
    pipeline_id: raw.PipelineId != null ? String(raw.PipelineId) : undefined,
    contact_ids: raw.RelationId != null ? [String(raw.RelationId)] : undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    close_date: raw.ExpectedOrderDate ?? undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    created_at: raw.CreatedOn ?? undefined,
    updated_at: raw.ModifiedOn ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Subject = data.title
  if (data.value?.amount !== undefined) out.EstimatedAmount = data.value.amount
  if (data.stage_id !== undefined) out.PhaseId = data.stage_id
  if (data.pipeline_id !== undefined) out.PipelineId = data.pipeline_id
  if (data.close_date !== undefined) out.ExpectedOrderDate = data.close_date
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.probability !== undefined) out.OpportunityPercent = data.probability
  if (data.status !== undefined) out.Status = data.status
  return out
}
