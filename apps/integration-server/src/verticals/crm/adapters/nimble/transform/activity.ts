import type { Activity } from '../../../schema/activity'

/**
 * Nimble does not expose a generic activity/task endpoint.
 * This module exists for interface completeness — methods return 501 via the registry.
 */

export interface RawNimbleActivity {
  id: string | number
  [key: string]: unknown
}

export function transformActivity(raw: RawNimbleActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}
