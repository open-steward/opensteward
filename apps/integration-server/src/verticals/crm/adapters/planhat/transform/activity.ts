import type { Activity } from '../../../schema/activity'

/**
 * Planhat tracks NPS/health scores rather than traditional sales activities.
 * This file exists for interface completeness — all activity methods return 501.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RawPlanhatActivity {}

export function transformActivity(_raw: RawPlanhatActivity): Activity {
  throw new Error('Planhat does not support activities')
}
