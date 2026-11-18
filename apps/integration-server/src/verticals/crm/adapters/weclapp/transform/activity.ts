import type { Activity } from '../../../schema/activity'

// weclapp does not have a standard activities endpoint. Stub for structural completeness.

export interface RawWeclappActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawWeclappActivity): Activity {
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
