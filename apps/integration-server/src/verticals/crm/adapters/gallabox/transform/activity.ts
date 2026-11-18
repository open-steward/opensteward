/**
 * Gallabox does not have a native Activity resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 *
 * Docs: https://developers.gallabox.com/
 */
import type { Activity } from '../../../schema/activity'

export interface RawGallaboxActivity {
  id: string | number
  [key: string]: unknown
}

export function transformActivity(raw: RawGallaboxActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
