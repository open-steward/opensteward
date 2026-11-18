import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline } from '../../../schema/pipeline'

/**
 * Pipeline.v2.yaml ("Funil de negócio"): id, name, dateCreated, priority.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Pipeline.v2.yaml
 */
export interface RawMoskitPipeline {
  id: number
  name?: string
  dateCreated?: string
  priority?: number
  [key: string]: unknown
}

/**
 * Stage.v2.yaml ("Fase do negócio"): id, name, priority, description,
 * dateCreated, pipeline (EntityId { id }).
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Stage.v2.yaml
 */
export interface RawMoskitStage {
  id: number
  name?: string
  priority?: number
  description?: string
  dateCreated?: string
  pipeline?: { id?: number } | null
  [key: string]: unknown
}

/**
 * A pipeline with the stages GET /stages returned for it, in the order the
 * API returned them. `priority` has no documented meaning, so it is not
 * mapped to `order`; both raw payloads stay in `metadata`.
 */
export function transformPipeline(raw: RawMoskitPipeline, stages: RawMoskitStage[]): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: stages.map((s) => ({ id: String(s.id), name: s.name ?? '' })),
    created_at: toIsoDatetime(raw.dateCreated),
    metadata: { ...raw, stages },
  }
}
