import type { Pipeline } from '../../../schema/pipeline'

// Kintone does not have a native pipeline concept.
// Pipelines are not applicable to this adapter.
// This file is a placeholder to satisfy the file structure convention.
export type RawKintonePipeline = Record<string, unknown>

export function transformPipeline(_raw: RawKintonePipeline): Pipeline {
  throw new Error('Kintone does not support pipelines')
}
