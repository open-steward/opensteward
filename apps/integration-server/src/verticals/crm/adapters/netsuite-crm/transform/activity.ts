import type { Activity } from '../../../schema/activity'

// NetSuite CRM activities — stub
export interface RawNetsuiteActivity {
  id: string | number
  [key: string]: unknown
}

export function transformActivity(raw: RawNetsuiteActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}
