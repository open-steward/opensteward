import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawActiveCampaignStage {
  id: string | number
  title: string
  order?: string | number
  [key: string]: unknown
}

export interface RawActiveCampaignPipeline {
  id: string | number
  title: string
  [key: string]: unknown
}

function transformStage(raw: RawActiveCampaignStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.title,
    order: raw.order != null ? Number(raw.order) : undefined,
  }
}

export function transformPipeline(
  raw: RawActiveCampaignPipeline,
  stages: RawActiveCampaignStage[] = [],
): Pipeline {
  return {
    id: String(raw.id),
    name: raw.title,
    stages: stages.map(transformStage),
    metadata: raw,
  }
}
