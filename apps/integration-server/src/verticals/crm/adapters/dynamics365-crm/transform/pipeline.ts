import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

const D365_DEFAULT_STAGES: PipelineStage[] = [
  { id: '1', name: 'Qualify', order: 0 },
  { id: '2', name: 'Develop', order: 1 },
  { id: '3', name: 'Propose', order: 2 },
  { id: '4', name: 'Close', order: 3 },
]

/**
 * Dynamics 365 has no dedicated pipeline object. We synthesise a single
 * pipeline with the standard out-of-box opportunity stages.
 */
export function transformPipeline(): Pipeline {
  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages: D365_DEFAULT_STAGES,
    is_active: true,
    metadata: { source: 'synthesised', stages: D365_DEFAULT_STAGES },
  }
}
