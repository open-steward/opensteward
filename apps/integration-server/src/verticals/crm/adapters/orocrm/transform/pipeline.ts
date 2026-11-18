/**
 * OroCRM Sales Pipeline → canonical Pipeline.
 *
 * OroCRM models sales funnels as "Sales Funnels" (`salesfunnels`) in its
 * JSON:API. Each funnel has a name and a set of steps. However, the more
 * commonly used pipeline concept maps to the opportunity workflow stages
 * defined in OroCRM, accessible via the `workflowdefinitions` endpoint or
 * via the `sales_opportunity_flow` workflow steps.
 *
 * For practical integration purposes we surface each workflow definition
 * that is named/typed as an opportunity-related workflow as a Pipeline.
 * The workflow steps become PipelineStages.
 *
 * Docs: https://doc.oroinc.com/backend/api/
 */
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import type { JsonApiRecord } from '../client'
import { strAttr } from './shared'

export interface RawOrocrmWorkflowStep {
  id: string
  label?: string | null
  stepOrder?: number | null
  isFinal?: boolean | null
  [key: string]: unknown
}

export interface RawOrocrmWorkflowDefinition extends JsonApiRecord {
  type: 'workflowdefinitions'
}

export function transformPipeline(
  record: JsonApiRecord,
  steps: RawOrocrmWorkflowStep[] = [],
): Pipeline {
  const stages: PipelineStage[] = steps
    .filter((s) => !s.isFinal)
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
    .map((s, idx) => ({
      id: String(s.id),
      name: s.label ?? String(s.id),
      order: idx,
    }))

  const label = strAttr(record, 'label') ?? strAttr(record, 'name') ?? String(record.id)
  const isActive = record.attributes?.['active'] !== false

  return {
    id: String(record.id),
    name: label,
    stages: stages.length > 0 ? stages : undefined,
    is_active: isActive,
    created_at: strAttr(record, 'createdAt'),
    updated_at: strAttr(record, 'updatedAt'),
    metadata: {
      id: record.id,
      type: record.type,
      attributes: record.attributes,
    },
  }
}
