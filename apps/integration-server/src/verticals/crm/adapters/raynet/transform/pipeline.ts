import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { requiredText } from '../required'

/**
 * A row of GET /businessCaseType/ ("list of deal types"). Fields are the
 * documented 200 example: `{ id, code01, strValue01, extIds, sequenceNumber }`.
 */
export interface RawRaynetBusinessCaseType {
  id: number
  code01?: string | null
  strValue01?: string | null
  extIds?: unknown
  sequenceNumber?: number | null
  [key: string]: unknown
}

/**
 * A row of GET /businessCasePhase/ ("list of deal stages"). Documented 200
 * example: `{ id, code01, code02, strValue01, probability, businessCaseTypeId,
 * extIds, sequenceNumber, locked }`.
 */
export interface RawRaynetBusinessCasePhase {
  id: number
  code01?: string | null
  code02?: string | null
  strValue01?: string | null
  probability?: number | null
  businessCaseTypeId?: number | null
  extIds?: unknown
  sequenceNumber?: number | null
  locked?: boolean | null
  [key: string]: unknown
}

function bySequence<T extends { sequenceNumber?: number | null; id: number }>(a: T, b: T): number {
  const sa = a.sequenceNumber ?? Number.POSITIVE_INFINITY
  const sb = b.sequenceNumber ?? Number.POSITIVE_INFINITY
  return sa !== sb ? sa - sb : a.id - b.id
}

function transformStage(raw: RawRaynetBusinessCasePhase, order: number): PipelineStage {
  return {
    id: String(raw.id),
    name: requiredText(raw.code01, `deal stage ${raw.id}`),
    order,
    win_probability: typeof raw.probability === 'number' ? raw.probability : undefined,
  }
}

/**
 * One deal type as a pipeline, its stages being the phases whose
 * `businessCaseTypeId` is this type's id, ordered by `sequenceNumber`.
 */
export function transformPipeline(
  type: RawRaynetBusinessCaseType,
  phases: readonly RawRaynetBusinessCasePhase[],
): Pipeline {
  const own = phases.filter((p) => p.businessCaseTypeId === type.id).sort(bySequence)
  return {
    id: String(type.id),
    name: requiredText(type.code01, `deal type ${type.id}`),
    stages: own.map((p, i) => transformStage(p, i)),
    metadata: type,
  }
}

/** Every deal type as a pipeline, in the types' `sequenceNumber` order. */
export function transformPipelines(
  types: readonly RawRaynetBusinessCaseType[],
  phases: readonly RawRaynetBusinessCasePhase[],
): Pipeline[] {
  return [...types].sort(bySequence).map((t) => transformPipeline(t, phases))
}
