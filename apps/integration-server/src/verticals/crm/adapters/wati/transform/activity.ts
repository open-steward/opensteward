/**
 * Wati does not have a native Activity resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 */
import type { Activity } from '../../../schema/activity'

export interface RawWatiActivity {
  id: string | number
  [key: string]: unknown
}

export function transformActivity(raw: RawWatiActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
