import type { Activity } from '../../../schema/activity'

/**
 * Streak has no dedicated activity resource — the adapter returns 501 for all
 * activity methods. This module is provided for interface completeness.
 */
export interface RawStreakActivity {
  [key: string]: unknown
}

 
export function transformActivity(_raw: RawStreakActivity): Activity {
  throw new Error('Streak does not support a dedicated activity resource')
}
