import type { Pipeline } from '../../../schema/pipeline'
import { SYNTHETIC_PIPELINE } from '../constants'

/**
 * Vtiger has no pipeline module.
 * Returns a single synthesised pipeline based on canonical sales stages.
 */
export function buildSyntheticPipelines(): Pipeline[] {
  return [
    {
      id: SYNTHETIC_PIPELINE.id,
      name: SYNTHETIC_PIPELINE.name,
      is_active: true,
      stages: SYNTHETIC_PIPELINE.stages.map((s) => ({
        id: s.id,
        name: s.name,
        order: s.order,
      })),
      metadata: {},
    },
  ]
}

export function buildSyntheticPipeline(): Pipeline {
  return buildSyntheticPipelines()[0]!
}
