import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

// Mautic Segment mapped to Pipeline (closest concept)
export interface RawMauticSegment {
  id?: string | number
  name?: string
  isPublished?: boolean
  [key: string]: unknown
}

export function transformSegmentAsPipeline(raw: RawMauticSegment): Pipeline {
  const stage: PipelineStage = {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
  }
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    is_active: raw.isPublished !== false,
    stages: [stage],
    metadata: raw,
  }
}
