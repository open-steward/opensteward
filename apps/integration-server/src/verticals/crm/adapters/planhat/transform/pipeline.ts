import type { Pipeline } from '../../../schema/pipeline'

/**
 * Planhat has no pipeline concept — this file exists for interface completeness.
 * All pipeline methods return 501 via the adapter registry.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RawPlanhatPipeline {}

export function transformPipeline(_raw: RawPlanhatPipeline): Pipeline {
  throw new Error('Planhat does not support pipelines')
}
