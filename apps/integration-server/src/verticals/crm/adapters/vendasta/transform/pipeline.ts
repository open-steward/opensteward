/**
 * Pipeline transform: Vendasta CRM Pipeline <-> OpenSteward canonical Pipeline.
 *
 * Vendasta pipeline objects come from /v1/crm/pipeline/list and have the shape:
 *   { pipelineId, name, namespace, objectType, stages: [{ stageId, name }] }
 */

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawVendastaPipelineStage {
  stageId?: string
  name?: string
  [key: string]: unknown
}

export interface RawVendastaPipeline {
  pipelineId?: string
  name?: string
  namespace?: string
  objectType?: string
  stages?: RawVendastaPipelineStage[]
  [key: string]: unknown
}

function transformStage(raw: RawVendastaPipelineStage, order: number): PipelineStage {
  return {
    id:    raw.stageId ?? String(order),
    name:  raw.name ?? '',
    order,
  }
}

export function transformPipeline(raw: RawVendastaPipeline): Pipeline {
  return {
    id:     raw.pipelineId ?? '',
    name:   raw.name ?? '',
    stages: (raw.stages ?? []).map((s, i) => transformStage(s, i)),
    metadata: raw as Record<string, unknown>,
  }
}
