import type { Activity } from '../../../schema/activity'

// Sansan does not have a standalone activities API.
// This transform is a placeholder; listActivities returns [].
export interface RawSansanActivity {
  id?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawSansanActivity): Activity {
  return {
    id: String(raw.id ?? ''),
    metadata: raw,
  }
}
