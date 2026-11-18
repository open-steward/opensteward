import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Raw Accelo prospect type object as returned by GET /prospects/types.
 *
 * Accelo does not have an explicit "pipeline" concept but organises prospects
 * by "type" (a named category such as "New Business", "Renewal") and tracks
 * stage progression via prospect statuses. A prospect type therefore maps
 * cleanly to a canonical Pipeline, and the global prospect statuses become
 * the ordered stages of each pipeline.
 *
 * Fields confirmed via SyncHub data model (api.accelo.com/docs / accelo.github.io/docs):
 *   id, title, standing, ordering, parent
 */
export interface RawAcceloProspectType {
  id: string | number
  title?: string
  /** standing: active | inactive */
  standing?: string
  ordering?: string | number
  parent?: string | number | { id: string | number; title?: string; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * Raw Accelo prospect status object as returned by GET /prospects/statuses.
 *
 * Statuses represent the stages through which a prospect progresses.
 * They are global (not scoped per type) and are re-used as pipeline stages.
 *
 * Fields: id, title, color, ordering, standing
 */
export interface RawAcceloProspectStatus {
  id: string | number
  title?: string
  color?: string
  ordering?: string | number
  standing?: string
  [key: string]: unknown
}

/** Convert a prospect status to a canonical PipelineStage. */
function transformStatus(raw: RawAcceloProspectStatus): PipelineStage {
  const order = raw.ordering != null ? parseInt(String(raw.ordering), 10) : undefined
  return {
    id: String(raw.id),
    name: raw.title ?? String(raw.id),
    order: order != null && !isNaN(order) ? order : undefined,
    // Accelo statuses don't carry per-stage win_probability; omit
  }
}

/**
 * Transform a raw Accelo prospect type into a canonical Pipeline.
 *
 * @param raw      The prospect type object from GET /prospects/types[/{id}].
 * @param statuses Optional list of prospect statuses to embed as pipeline stages.
 *                 When provided they are sorted by `ordering` ascending.
 */
export function transformPipeline(
  raw: RawAcceloProspectType,
  statuses?: RawAcceloProspectStatus[],
): Pipeline {
  const is_active = raw.standing != null
    ? raw.standing.toLowerCase() === 'active'
    : undefined

  let stages: PipelineStage[] | undefined
  if (statuses && statuses.length > 0) {
    const activeStatuses = statuses.filter(
      (s) => s.standing == null || s.standing.toLowerCase() !== 'inactive',
    )
    stages = activeStatuses
      .map(transformStatus)
      .sort((a, b) => {
        const ao = a.order ?? Infinity
        const bo = b.order ?? Infinity
        return ao - bo
      })
  }

  return {
    id: String(raw.id),
    name: raw.title ?? String(raw.id),
    stages,
    is_active,
    // Accelo prospect types don't carry created_at / updated_at in the type object
    created_at: toIsoDatetime((raw as Record<string, unknown>)['date_created']),
    updated_at: toIsoDatetime((raw as Record<string, unknown>)['date_modified']),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
