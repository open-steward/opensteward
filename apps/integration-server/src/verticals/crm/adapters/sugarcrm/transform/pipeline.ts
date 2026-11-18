import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSugarSalesStageEnum {
  values?: Record<string, string>
  [key: string]: unknown
}

export function transformPipeline(raw: RawSugarSalesStageEnum): Pipeline {
  const values = raw.values ?? {}
  const stages: PipelineStage[] = Object.entries(values).map(([key, label], index) => ({
    id: key,
    name: label,
    order: index,
  }))

  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages,
    is_active: true,
    metadata: raw,
  }
}
