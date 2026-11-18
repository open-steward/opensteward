import type { Activity } from '../../../schema/activity'

/**
 * Folk has no activity or task tracking API.
 * This file exists for structural completeness — the adapter returns 501
 * for all activity methods.
 */

export interface RawFolkActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawFolkActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}
