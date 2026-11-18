import type { Pipeline } from '../../../schema/pipeline'

export interface RawAgendorPipeline {
  id: number | string
  name?: string
  funnel_stages?: Array<{ id: number | string; name?: string; sequence?: number }>
  [key: string]: unknown
}

export function transformPipeline(raw: RawAgendorPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: raw.funnel_stages?.map((s) => ({
      id: String(s.id),
      name: s.name ?? '',
      order: s.sequence,
    })),
    metadata: raw,
  }
}
