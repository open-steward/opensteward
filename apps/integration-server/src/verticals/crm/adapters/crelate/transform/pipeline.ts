/**
 * Crelate workflow type + its workflow statuses → canonical Pipeline.
 *
 * v3 has no endpoint that lists workflow types; the complete set is
 * documented in the `workflow_type_ids` parameter of GET /workflowstatuses
 * (see WORKFLOW_TYPES in constants.ts). A workflow type's stages are the
 * `RetrieveWorkflowStatuses` rows GET /workflowstatuses returns for it:
 *   Id        "The globally unique primary key of a record."
 *   Name      "The name of the Workflow Status."
 *   SortOrder "The sort order of the Workflow Status relative to other Workflow Statuses."
 *   WorkflowTypeId "The Workflow Type of the Workflow Status." (Lookup)
 */

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { requireId, type CrelateLookup } from './contact'

export interface RawCrelateWorkflowStatus {
  Id?: string | null
  Name?: string | null
  SortOrder?: number | null
  WorkflowTypeId?: CrelateLookup | null
  [key: string]: unknown
}

export interface CrelateWorkflowType {
  readonly Id: string
  readonly Name: string
}

/** Stages in `SortOrder` (statuses without one last, in the order returned). */
function toStages(statuses: RawCrelateWorkflowStatus[]): PipelineStage[] {
  const rank = (s: RawCrelateWorkflowStatus) =>
    typeof s.SortOrder === 'number' ? s.SortOrder : Number.POSITIVE_INFINITY
  return statuses
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }, order) => ({ id: requireId(s, 'workflow status'), name: s.Name ?? '', order }))
}

export function transformPipeline(
  type: CrelateWorkflowType,
  statuses: RawCrelateWorkflowStatus[],
): Pipeline {
  return {
    id: type.Id,
    name: type.Name,
    stages: toStages(statuses),
    metadata: { Id: type.Id, Name: type.Name, WorkflowStatuses: statuses },
  }
}
