import type { Activity } from '../../../schema/activity'

// Holded CRM does not have a standard activities endpoint.
// This file exists for structural completeness but is not used.

export interface RawHoldedActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawHoldedActivity): Activity {
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
