import type { Pipeline } from '../../../schema/pipeline'
import { SYNTHETIC_PIPELINE } from '../constants'

/**
 * Oracle CX has no pipeline API.
 * Returns a single hard-coded pipeline with canonical stage names.
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
