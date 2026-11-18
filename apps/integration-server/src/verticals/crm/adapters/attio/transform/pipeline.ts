import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

// ── Raw Attio types ────────────────────────────────────────────────────────

export interface RawAttioStageOption {
  id: string
  title: string
  is_archived?: boolean
  [key: string]: unknown
}

/** Shape returned by GET /v2/objects/deals/attributes/stage */
export interface RawAttioPipeline {
  id: {
    attribute_id: string
    [key: string]: unknown
  }
  title: string
  config?: {
    select_options?: RawAttioStageOption[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

function transformStage(raw: RawAttioStageOption, order: number): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.title,
    order,
  }
}

export function transformPipeline(raw: RawAttioPipeline): Pipeline {
  const options = raw.config?.select_options ?? []
  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages: options.map((opt, i) => transformStage(opt, i)),
    is_active: true,
    metadata: raw,
  }
}
