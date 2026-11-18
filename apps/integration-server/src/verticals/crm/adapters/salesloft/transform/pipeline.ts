import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSalesloftStage {
  id: number
  name?: string
  display_order?: number
  [key: string]: unknown
}

/**
 * Salesloft has no pipeline object — we synthesise a single default pipeline
 * from the list of opportunity stages.
 */
export function transformPipeline(stages: RawSalesloftStage[]): Pipeline {
  const pipelineStages: PipelineStage[] = stages.map((s) => ({
    id: String(s.id),
    name: s.name ?? '',
    order: s.display_order,
  }))

  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages: pipelineStages,
    is_active: true,
    metadata: { synthesised: true, stages },
  }
}
