/**
 * Follow Up Boss pipeline ↔ canonical Pipeline transform.
 *
 * FUB pipeline wire shape (GET /v1/pipelines):
 *   id    number
 *   name  string
 */
import type { Pipeline } from '../../../schema/pipeline'

export interface RawFollowUpBossPipeline {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawFollowUpBossPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    metadata: raw as Record<string, unknown>,
  }
}
