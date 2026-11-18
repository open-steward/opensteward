/**
 * Respond.io ↔ canonical Pipeline transforms.
 *
 * Respond.io does not expose a sales pipeline endpoint in its v2 REST API.
 * These stubs exist so the transform module is complete; the adapter
 * does not expose pipeline methods (the registry returns 501 automatically).
 */
import type { Pipeline } from '../../../schema/pipeline'

export interface RawRespondIoPipeline {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawRespondIoPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
