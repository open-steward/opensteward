/**
 * Pipeline transform for Corteza CRM.
 *
 * Corteza CRM does not expose a dedicated pipeline API. The pipeline is
 * implicitly defined by the Opportunity module's `StageName` picklist.
 * The default CRM application ships with the following stages in order:
 *   Prospecting, Qualification, Needs Analysis, Value Proposition,
 *   Id. Decision Makers, Perception Analysis, Proposal/Price Quote,
 *   Negotiation/Review, Closed Won, Closed Lost
 *
 * This module synthesises a single canonical Pipeline from the known
 * stage list so callers get a usable structure without a dedicated API call.
 */

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export const CORTEZA_CRM_PIPELINE_ID = 'corteza-crm-default'
export const CORTEZA_CRM_PIPELINE_NAME = 'Sales'

export const CORTEZA_OPPORTUNITY_STAGES: readonly string[] = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Value Proposition',
  'Id. Decision Makers',
  'Perception Analysis',
  'Proposal/Price Quote',
  'Negotiation/Review',
  'Closed Won',
  'Closed Lost',
]

function buildStages(): PipelineStage[] {
  return CORTEZA_OPPORTUNITY_STAGES.map((name, idx) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    order: idx,
  }))
}

/** Return the single synthesised pipeline for Corteza CRM. */
export function getCortezaPipeline(): Pipeline {
  return {
    id: CORTEZA_CRM_PIPELINE_ID,
    name: CORTEZA_CRM_PIPELINE_NAME,
    stages: buildStages(),
    is_active: true,
    metadata: {
      source: 'corteza-crm-synthesised',
      stages: CORTEZA_OPPORTUNITY_STAGES,
    },
  }
}
