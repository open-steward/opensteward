import type { Pipeline } from '../../../schema/pipeline'

// Sansan does not have a pipeline API.
// This file is a placeholder to satisfy the file structure convention.
export type RawSansanPipeline = Record<string, unknown>

export function transformPipeline(_raw: RawSansanPipeline): Pipeline {
  throw new Error('Sansan does not support pipelines')
}
