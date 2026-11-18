/**
 * 1CRM does not expose a dedicated "pipeline" resource through its REST API.
 * Deal stages are a system-wide enumeration on the Opportunity module's
 * `sales_stage` field, returned by GET /api.php/meta/fields/Opportunity.
 *
 * This transform synthesizes a single canonical Pipeline from the well-known
 * 1CRM default stage list so callers can discover stage names without a
 * live API call. A "1crm-default" pipeline is always returned.
 */

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/** Well-known 1CRM Opportunity sales_stage values in display order. */
export const ONECRM_SALES_STAGES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'Prospecting', name: 'Prospecting' },
  { id: 'Qualification', name: 'Qualification' },
  { id: 'Needs Analysis', name: 'Needs Analysis' },
  { id: 'Value Proposition', name: 'Value Proposition' },
  { id: 'Id. Decision Makers', name: 'Id. Decision Makers' },
  { id: 'Perception Analysis', name: 'Perception Analysis' },
  { id: 'Proposal/Price Quote', name: 'Proposal/Price Quote' },
  { id: 'Negotiation/Review', name: 'Negotiation/Review' },
  { id: 'Closed Won', name: 'Closed Won' },
  { id: 'Closed Lost', name: 'Closed Lost' },
]

const DEFAULT_PIPELINE_ID = '1crm-default'

function buildStages(): PipelineStage[] {
  return ONECRM_SALES_STAGES.map((s, idx) => ({
    id: s.id,
    name: s.name,
    order: idx,
    win_probability: s.id === 'Closed Won' ? 100
      : s.id === 'Closed Lost' ? 0
      : undefined,
  }))
}

/** Build the synthetic default 1CRM pipeline. */
export function buildDefaultPipeline(): Pipeline {
  return {
    id: DEFAULT_PIPELINE_ID,
    name: '1CRM Default Sales Pipeline',
    stages: buildStages(),
    is_active: true,
    metadata: { source: '1crm-static', stages: ONECRM_SALES_STAGES },
  }
}

/** Return the default pipeline if the requested ID matches; undefined otherwise. */
export function getPipelineById(id: string): Pipeline | undefined {
  if (id === DEFAULT_PIPELINE_ID) return buildDefaultPipeline()
  return undefined
}
