/**
 * Totango pipeline transform.
 *
 * Totango does not expose a "pipeline" concept via its public API.
 * We represent Totango lifecycle status groups (e.g. "Trial", "Paying", "Churn")
 * as read-only pipelines so the CRM vertical has something to return from
 * listPipelines / getPipeline calls.
 */

import type { Pipeline } from '../../../schema/pipeline'

export interface RawTotangoPipeline {
  id?: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawTotangoPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    metadata: raw,
  }
}
