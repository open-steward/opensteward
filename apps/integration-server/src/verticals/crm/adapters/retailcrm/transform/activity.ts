import type { Activity } from '../../../schema/activity'

// RetailCRM does not have standard activities. Stub for structural completeness.

export interface RawRetailCrmActivity {
  id: number | string
  [key: string]: unknown
}

export function transformActivity(raw: RawRetailCrmActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  return out
}
