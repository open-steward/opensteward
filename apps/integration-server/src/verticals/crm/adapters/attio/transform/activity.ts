import type { Activity } from '../../../schema/activity'

/**
 * Attio v2 does not expose a first-class activity/task API.
 * This file exists for structural completeness — transforms are no-ops
 * and the adapter returns 501 for all activity methods.
 */

export interface RawAttioActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawAttioActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}
