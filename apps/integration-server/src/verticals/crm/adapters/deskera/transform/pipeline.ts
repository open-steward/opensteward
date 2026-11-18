import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawDeskeraPipelineStage {
  id: string | number
  name?: string
  [key: string]: unknown
}

export interface RawDeskeraPipeline {
  id: string | number
  name?: string
  stages?: RawDeskeraPipelineStage[]
  [key: string]: unknown
}

export function transformPipeline(raw: RawDeskeraPipeline): Pipeline {
  const stages: PipelineStage[] | undefined = raw.stages?.map((s, i) => ({
    id: String(s.id),
    name: s.name ?? '',
    order: i,
  }))
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages,
    metadata: raw,
  }
}
