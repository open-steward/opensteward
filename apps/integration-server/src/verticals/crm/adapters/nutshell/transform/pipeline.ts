import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Nutshell "milestones" serve as pipeline stages — the API only exposes milestones
 * (not an explicit pipeline object). We synthesise a single pipeline from the list.
 */
export interface RawNutshellMilestone {
  id: number | string
  name: string
  /** Order/position index */
  orderBy?: number
  winProbability?: number
  isDefault?: boolean
  [key: string]: unknown
}

function transformStage(raw: RawNutshellMilestone, index: number): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.orderBy ?? index,
    win_probability: raw.winProbability,
  }
}

/**
 * Build a synthetic pipeline from the flat list of Nutshell milestones.
 */
export function transformPipelineFromMilestones(milestones: RawNutshellMilestone[]): Pipeline {
  return {
    id: 'default',
    name: 'Default Pipeline',
    is_active: true,
    stages: milestones.map((m, i) => transformStage(m, i)),
    metadata: { milestones },
  }
}
