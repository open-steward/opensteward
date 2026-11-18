import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawAgileCrmMilestone {
  id: number
  name: string
  probability?: number
  color?: string
}

export interface RawAgileCrmPipeline {
  id: number
  name: string
  milestones?: RawAgileCrmMilestone[]
  [key: string]: unknown
}

function transformMilestone(m: RawAgileCrmMilestone, index: number): PipelineStage {
  return {
    id: String(m.id),
    name: m.name,
    order: index,
    win_probability: m.probability,
  }
}

export function transformPipeline(raw: RawAgileCrmPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: (raw.milestones ?? []).map(transformMilestone),
    metadata: raw,
  }
}
