import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * One row of POST /dealPipelines.list. The response item is `IdAndName`:
 *
 *   "items":{"title":"IdAndName","type":"object","properties":{"id":{"type":"string",...},"name":{"type":"string"}}}
 *
 * (https://developer.focus.teamleader.eu/docs/api/deal-pipelines-list, content
 * chunk https://developer.focus.teamleader.eu/assets/js/0dc31f63.124908a6.js)
 */
export interface RawTeamleaderDealPipeline {
  id: string
  name: string
  [key: string]: unknown
}

/**
 * One row of POST /dealPhases.list, "Get a list of all phases a deal can go
 * through, sorted by their order in the flow." Documented item properties:
 * id, name, actions, requires_attention_after, probability (example 0.75).
 *
 * (https://developer.focus.teamleader.eu/docs/api/deal-phases-list, content
 * chunk https://developer.focus.teamleader.eu/assets/js/6f13b6c5.e5a00ce2.js)
 */
export interface RawTeamleaderDealPhase {
  id: string
  name: string
  probability?: number
  [key: string]: unknown
}

/**
 * `order` is the phase's position in the list, which the docs define as
 * "sorted by their order in the flow". `probability` is a fraction (the
 * documented example is 0.75); the canonical `win_probability` is 0–100.
 * dealPhases.list gives no range, but Teamleader documents its deal
 * probability as a fraction: deals.create's `estimated_probability` is
 * "A number between 0 and 1 (inclusive)" (https://developer.focus.teamleader.eu/docs/api/deals-create,
 * chunk https://developer.focus.teamleader.eu/assets/js/12360353.4b1f7315.js),
 * and dealPhases.create's `estimated_probability` example is 0.5.
 */
function transformStage(raw: RawTeamleaderDealPhase, index: number): PipelineStage {
  const stage: PipelineStage = { id: raw.id, name: raw.name, order: index }
  if (typeof raw.probability === 'number') {
    stage.win_probability = Math.round(raw.probability * 10_000) / 100
  }
  return stage
}

/** A pipeline row plus every phase listed under its `filter.deal_pipeline_id`, in flow order. */
export function transformPipeline(
  raw: RawTeamleaderDealPipeline,
  phases: RawTeamleaderDealPhase[],
): Pipeline {
  return {
    id: raw.id,
    name: raw.name,
    stages: phases.map(transformStage),
    metadata: { pipeline: raw, phases },
  }
}
