import type { Deal } from '../../../schema/deal'
import { optDate, optKey, optString, requireKey } from '../records'

/** components.schemas.Opportunity of the Sage CRM 2024 R2 RESTful API reference (fields read here). */
export interface RawSageCrmOpportunity {
  Oppo_OpportunityId?: number
  Oppo_Description?: string
  Oppo_Status?: string
  Oppo_Stage?: string
  Oppo_AssignedUserId?: string
  Oppo_PrimaryCompanyId?: number
  Oppo_PrimaryPersonId?: number
  oppo_targetclose?: string
  Oppo_CreatedDate?: string
  Oppo_UpdatedDate?: string
  [key: string]: unknown
}

/**
 * `value` is omitted: the documented amounts (Oppo_Forecast, Oppo_Total) carry
 * their currency as a `*_CID` string, a Sage CRM currency record id, not an
 * ISO 4217 code. `probability` is omitted: Oppo_Certainty is documented only
 * as `integer/int32`, with no stated range.
 */
export function transformDeal(raw: RawSageCrmOpportunity): Deal {
  const id = requireKey(raw.Oppo_OpportunityId, 'Oppo_OpportunityId')
  // Oppo_Description is a required property of the documented Opportunity schema.
  if (typeof raw.Oppo_Description !== 'string') {
    throw Object.assign(new Error(`Sage CRM opportunity ${id} has no Oppo_Description`), {
      statusCode: 502,
    })
  }
  const deal: Deal = { id, title: raw.Oppo_Description, metadata: raw }
  const status = optString(raw.Oppo_Status)
  if (status) deal.status = status
  const stage = optString(raw.Oppo_Stage)
  if (stage) deal.stage = stage
  const owner = optString(raw.Oppo_AssignedUserId)
  if (owner) deal.owner_id = owner
  const company = optKey(raw.Oppo_PrimaryCompanyId)
  if (company) deal.company_id = company
  const person = optKey(raw.Oppo_PrimaryPersonId)
  if (person) deal.contact_ids = [person]
  const close = optDate(raw.oppo_targetclose)
  if (close) deal.close_date = close
  const created = optDate(raw.Oppo_CreatedDate)
  if (created) deal.created_at = created
  const updated = optDate(raw.Oppo_UpdatedDate)
  if (updated) deal.updated_at = updated
  return deal
}

// Write mapping below is unchanged by the read rebuild (write methods are out
// of its scope); its field names are not from the documented Opportunity schema.
export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.oppo_description = data.title
  if (data.value?.amount !== undefined) out.oppo_targetsales = data.value.amount
  if (data.value?.currency !== undefined) out.oppo_currency = data.value.currency
  if (data.status !== undefined) out.oppo_status = data.status
  if (data.stage_id !== undefined) out.oppo_stageid = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.oppo_forecastid = Number(data.pipeline_id)
  if (data.company_id !== undefined) out.comp_companyid = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.pers_personid = Number(data.contact_ids[0])
  if (data.close_date !== undefined) out.oppo_targetclose = data.close_date
  return out
}
