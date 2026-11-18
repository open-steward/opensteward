import type { Pipeline } from '../../../schema/pipeline'

// Ragic does not have a native pipeline concept.
// Pipelines are not applicable to this adapter.
// This file is a placeholder to satisfy the file structure convention.
export type RawRagicPipeline = Record<string, unknown>

export function transformPipeline(_raw: RawRagicPipeline): Pipeline {
  throw new Error('Ragic does not support pipelines')
}
