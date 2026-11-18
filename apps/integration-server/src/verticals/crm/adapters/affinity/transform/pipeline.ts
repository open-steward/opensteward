import type { Pipeline } from '../../../schema/pipeline'

export interface RawAffinityList {
  id: number
  name: string
  type?: number
  [key: string]: unknown
}

export function transformPipeline(raw: RawAffinityList): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: [],
    metadata: raw,
  }
}
