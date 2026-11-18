import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Teamgate pipeline fields from GET /v4/pipelines:
 *   id, name, stages (array of stage objects with id, name, probability)
 */
export interface RawTeamgatePipelineStage {
  id: number | string
  name?: string
  probability?: number | null
  [key: string]: unknown
}

export interface RawTeamgatePipeline {
  id: number | string
  name?: string
  stages?: RawTeamgatePipelineStage[] | string
  [key: string]: unknown
}

export function transformPipeline(raw: RawTeamgatePipeline): Pipeline {
  let stages: PipelineStage[] | undefined
  if (Array.isArray(raw.stages) && raw.stages.length > 0) {
    stages = raw.stages.map((s, i) => ({
      id: String(s.id),
      name: typeof s.name === 'string' && s.name ? s.name : String(s.id),
      order: i,
      win_probability: typeof s.probability === 'number' ? s.probability : undefined,
    }))
  }

  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' && raw.name ? raw.name : String(raw.id),
    stages,
    metadata: raw as Record<string, unknown>,
  }
}
