import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface PodioStageOption {
  id: number
  text: string
  [key: string]: unknown
}

export function transformPipeline(
  dealAppId: string,
  options: PodioStageOption[],
  raw: Record<string, unknown>,
): Pipeline {
  const stages: PipelineStage[] = options.map((opt, idx) => ({
    id: String(opt.id),
    name: opt.text,
    order: idx,
  }))
  return {
    id: dealAppId,
    name: 'Deal Pipeline',
    stages,
    metadata: raw,
  }
}
