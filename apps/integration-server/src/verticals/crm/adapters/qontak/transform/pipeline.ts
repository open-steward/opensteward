import type { Pipeline } from '../../../schema/pipeline'
import { iso, requireId, requireText } from '../fields'

/**
 * A pipeline as GET /qontak/crm/pipelines and GET /qontak/crm/pipelines/{id}
 * return it.
 *
 * Qontak's CRM OpenAPI documents these two operations with the same
 * `{ meta, response: [...] }` example as its tasks list, so the only record
 * keys it shows are the ones every Qontak record carries: `id`, `name`,
 * `created_at`, `updated_at`. Those are all this transform reads; `id` and
 * `name` are required and throw when absent. Stages are left out: GET
 * /qontak/crm/pipelines/{id}/stages carries the same copied example, so no
 * stage shape is documented.
 */
export interface RawQontakPipeline {
  id: number | string
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformPipeline(raw: RawQontakPipeline): Pipeline {
  return {
    id: requireId(raw.id, 'pipeline'),
    name: requireText(raw.name, 'pipeline', 'name'),
    created_at: iso(raw.created_at),
    updated_at: iso(raw.updated_at),
    metadata: raw,
  }
}
