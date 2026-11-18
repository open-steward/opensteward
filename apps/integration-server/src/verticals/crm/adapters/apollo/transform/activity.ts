import type { Activity } from '../../../schema/activity'

/**
 * Apollo has no unified activity model — this type is kept for type safety even
 * though the adapter does not implement activity methods (returns 501).
 */
export interface RawApolloActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawApolloActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}
