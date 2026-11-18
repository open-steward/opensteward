import type { Pipeline } from '../../../schema/pipeline'

export type RawOntraportPipeline = Record<string, unknown>

export function transformPipeline(raw: RawOntraportPipeline): Pipeline {
  return {
    id: String(raw['id'] ?? ''),
    name: String(raw['name'] ?? ''),
    is_active: true,
    stages: [],
    metadata: raw,
  }
}
