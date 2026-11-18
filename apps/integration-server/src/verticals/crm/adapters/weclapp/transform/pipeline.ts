import type { Pipeline } from '../../../schema/pipeline'

export interface RawWeclappSalesStage {
  id: string
  name?: string
  [key: string]: unknown
}

export function transformPipelineFromStages(stages: RawWeclappSalesStage[]): Pipeline {
  return {
    id: 'weclapp-pipeline',
    name: 'Sales Pipeline',
    stages: stages.map((s, i) => ({
      id: String(s.id),
      name: s.name ?? '',
      order: i,
    })),
    metadata: { stages },
  }
}
