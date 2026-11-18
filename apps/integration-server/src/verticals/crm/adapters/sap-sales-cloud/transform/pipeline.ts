/**
 * SAP Sales Cloud V2 — Sales Phase (Pipeline) transform.
 *
 * SAP Sales Cloud V2 does not expose a traditional "pipeline" object.
 * Instead, sales phases are the stage progression used on opportunities.
 * We represent the full phase list as a single synthetic pipeline.
 * Endpoint: GET /sap/c4c/api/v1/sales-phase-service/salesPhases
 *
 * Key fields (individual phase):
 *   code             — phase code (used as stage_id)
 *   name             — human-readable phase label
 *   sequenceNumber   — numeric ordering
 *   winProbability   — default win probability for this phase
 */
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSapSalesPhase {
  code: string
  name?: string
  sequenceNumber?: number | string
  winProbability?: number | string
  [key: string]: unknown
}

function parseNumber(v: number | string | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return !isNaN(n) ? n : undefined
}

export function transformSalesPhaseToStage(raw: RawSapSalesPhase): PipelineStage {
  return {
    id: String(raw.code),
    name: raw.name ?? raw.code,
    order: parseNumber(raw.sequenceNumber),
    win_probability: parseNumber(raw.winProbability),
  }
}

/**
 * Aggregate a list of raw SAP sales phases into a single canonical Pipeline.
 * SAP has one global phase list; we synthesise a pipeline ID of 'default'.
 */
export function transformPipelineFromPhases(phases: RawSapSalesPhase[]): Pipeline {
  const stages = phases
    .map(transformSalesPhaseToStage)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages,
    is_active: true,
    metadata: { phases } as Record<string, unknown>,
  }
}
