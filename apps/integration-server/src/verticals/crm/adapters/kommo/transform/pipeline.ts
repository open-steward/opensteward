import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawKommoStatus {
  id: number
  name: string
  sort?: number
  type?: number
}

export interface RawKommoPipeline {
  id: number
  name: string
  is_archive?: boolean
  _embedded?: {
    statuses?: RawKommoStatus[]
  }
  [key: string]: unknown
}

function transformStage(raw: RawKommoStatus): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.sort,
  }
}

export function transformPipeline(raw: RawKommoPipeline): Pipeline {
  const stages = (raw._embedded?.statuses ?? []).map(transformStage)
  return {
    id: String(raw.id),
    name: raw.name,
    is_active: !raw.is_archive,
    stages,
    metadata: raw,
  }
}
