import type { Activity } from '../../../schema/activity'

// Samdock does not have a standard activities endpoint. Stub for structural completeness.

export interface RawSamdockActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawSamdockActivity): Activity {
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
