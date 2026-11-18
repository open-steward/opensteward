import type { Deal } from '../../../schema/deal'

/**
 * Planhat calls deals "Opportunities".
 *
 * Fields are the ones in the Opportunity property table and examples at
 * https://www.planhat.com/developers/api/opportunity:
 *   "title string Title of sales opportunity."
 *   "salesStage string Sales stage of opportunity."
 *   "companyId Yes objectId Related company id (planhat identifier)."
 *   "closeDate string Close date of the opportunity in ISO format."
 *   "ownerId objectId ObjectId of the team member owner of the opportunity."
 *   "status string Status of the opportunity, could be: active, won or lost."
 *
 * Not mapped: `value`. The page documents three amounts ("mrr number Monthly
 * opportunity value.", "arr number Annual opportunity value.", "nrr number Non
 * recurrent value.") and no single deal value, so picking one would be a guess.
 * `created_at`/`updated_at`: no creation or update timestamp is documented.
 * All of these stay in metadata.
 */
export interface RawPlanhatDeal {
  _id: string
  title?: string
  status?: string
  salesStage?: string
  closeDate?: string
  companyId?: string
  ownerId?: string
  [key: string]: unknown
}

/** The documented statuses: "active, won or lost". Anything else passes through. */
function mapStatus(status?: string): string | undefined {
  if (status === 'active') return 'open'
  return status
}

export function transformDeal(raw: RawPlanhatDeal): Deal {
  return {
    id: raw._id,
    // Required canonically; the "Get Opportunities by ID" example has no title.
    title: raw.title ?? '',
    status: mapStatus(raw.status),
    stage: raw.salesStage,
    company_id: raw.companyId,
    owner_id: raw.ownerId,
    close_date: raw.closeDate,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
