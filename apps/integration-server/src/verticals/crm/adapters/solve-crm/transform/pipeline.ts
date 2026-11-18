import type { Pipeline } from '../../../schema/pipeline'

export type RawSolvePipeline = Record<string, unknown>

export function transformPipeline(raw: RawSolvePipeline): Pipeline {
  return {
    id: String(raw['id'] ?? ''),
    name: String(raw['name'] ?? ''),
    is_active: true,
    stages: [],
    metadata: raw,
  }
}
