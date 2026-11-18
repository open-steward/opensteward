import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawApolloStage {
  id: string
  name: string
  position?: number
  team_id?: string
  [key: string]: unknown
}

export function transformStage(raw: RawApolloStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.position,
  }
}

/**
 * Apollo has no pipeline object — synthesise one from a list of stages.
 */
export function transformPipeline(stages: RawApolloStage[]): Pipeline {
  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages: stages.map(transformStage),
    is_active: true,
    metadata: { synthesised: true, stages },
  }
}
