/**
 * Gallabox does not have a native Pipeline resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 *
 * Docs: https://developers.gallabox.com/
 */
import type { Pipeline } from '../../../schema/pipeline'

export interface RawGallaboxPipeline {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawGallaboxPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
