import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { requireId } from '../refs'

/**
 * ForceManager has no pipeline resource. Its multi-pipeline model is the
 * Opportunity Type (GET /opportunityTypes) with Opportunity Statuses
 * (GET /opportunityStatuses) attached through `idParent`: "This is mostly used
 * to stick an Opportunity Status with an Opportunity Type (see [Types](#)
 * resource), in the case the Opportunity Types are used to represent multiple
 * pipelines" (https://developer.forcemanager.com/openapi.json).
 */
export interface RawForceManagerOpportunityType {
  id?: number | string | null
  descriptionEN?: string | null
  deleted?: boolean | null
  dateCreated?: string | null
  dateUpdated?: string | null
  [key: string]: unknown
}

export interface RawForceManagerOpportunityStatus {
  id?: number | string | null
  descriptionEN?: string | null
  idParent?: number | string | null
  order?: number | null
  deleted?: boolean | null
  [key: string]: unknown
}

function transformStage(raw: RawForceManagerOpportunityStatus): PipelineStage {
  return {
    id: requireId(raw, 'opportunity status'),
    name: raw.descriptionEN ?? '',
    order:
      typeof raw.order === 'number' && Number.isInteger(raw.order) && raw.order >= 0
        ? raw.order
        : undefined,
  }
}

/**
 * One Opportunity Type as a pipeline. Its stages are the non-deleted statuses
 * whose `idParent` is the type's id, in their documented `order` ("The
 * position of the Opportunity Status in the Opportunity Statuses value
 * list"), ties kept in upstream order. A status with a null `idParent`
 * belongs to no type and is attached to none.
 */
export function transformPipeline(
  type: RawForceManagerOpportunityType,
  statuses: RawForceManagerOpportunityStatus[],
): Pipeline {
  const id = requireId(type, 'opportunity type')
  const stages = statuses
    .filter((s) => s.idParent != null && String(s.idParent) === id && s.deleted !== true)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.order ?? 0) - (b.s.order ?? 0) || a.i - b.i)
    .map(({ s }) => transformStage(s))
  return {
    id,
    name: type.descriptionEN ?? '',
    stages,
    // "deleted | Boolean | If true, the Opportunity Type has been deleted and archived"
    is_active: type.deleted !== true,
    created_at: toIsoDatetime(type.dateCreated),
    updated_at: toIsoDatetime(type.dateUpdated),
    metadata: type,
  }
}
