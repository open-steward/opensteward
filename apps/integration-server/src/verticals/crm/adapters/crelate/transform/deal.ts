/**
 * Crelate v3 job (`RetrieveJobs`, the `Data` of GET /jobs and GET /jobs/{id})
 * → canonical Deal. Jobs are Crelate's opportunities.
 *
 * From https://app.crelate.com/api3/docs/v3/crelate-openapi.json:
 *   Id          "The globally unique primary key of a record."
 *   Name        "Job Name"
 *   AccountId   "The company associated with this Job" (Lookup)
 *   SalesWorkflowItemStatusId "The stage that this Job is in on the Sales board" (Lookup)
 *   Owners      "The owners of this Job record"
 *   Probability "The estimated probability that the Job will result in a "win" (percentage, 0 to 100)"
 *   EstimatedCloseDate "The date that the Job is estimated to close by"
 *   CreatedOn / ModifiedOn — date-time.
 *
 * `value` is left out. PotentialValue ("The total potential value of the
 * Job") is a bare number, and the v3 document has no currency field anywhere,
 * so a Money value cannot be built without assuming a currency. The raw
 * amounts stay in `metadata`.
 *
 * `pipeline_id` is left out: the job's `WorkflowTypeId` is "The type of
 * workflow (e.g., Recruiting or EmploymentSearch)", which is not the Sales
 * board its stage belongs to.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { primaryOwnerId, requireId, type CrelateLookup, type CrelateOwner } from './contact'

export interface RawCrelateJob {
  Id?: string | null
  Name?: string | null
  AccountId?: CrelateLookup | null
  SalesWorkflowItemStatusId?: CrelateLookup | null
  Owners?: CrelateOwner[] | null
  Probability?: number | null
  EstimatedCloseDate?: string | null
  CreatedOn?: string | null
  ModifiedOn?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawCrelateJob): Deal {
  const stage = raw.SalesWorkflowItemStatusId
  return {
    id: requireId(raw, 'job'),
    title: raw.Name ?? '',
    stage: stage?.Title ?? undefined,
    stage_id: stage?.Id ?? undefined,
    company_id: raw.AccountId?.Id ?? undefined,
    owner_id: primaryOwnerId(raw.Owners),
    probability:
      typeof raw.Probability === 'number' && raw.Probability >= 0 && raw.Probability <= 100
        ? raw.Probability
        : undefined,
    close_date: toIsoDatetime(raw.EstimatedCloseDate),
    created_at: toIsoDatetime(raw.CreatedOn),
    updated_at: toIsoDatetime(raw.ModifiedOn),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical → retired-v1 job body. Used only by the out-of-scope write
 * methods, which still target v1; kept as it was.
 */
export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.close_date !== undefined) out.estimated_close_date = data.close_date
  if (data.stage_id !== undefined) out.status_id = data.stage_id
  if (data.pipeline_id !== undefined) out.workflow_id = data.pipeline_id
  if (data.probability !== undefined) out.probability = data.probability
  if (data.value?.amount !== undefined) out.potential_value = data.value.amount
  return out
}
