import type { Activity } from '../../../schema/activity'

// Qiscus does not have a native activity entity
// This is a stub — list returns [] and write methods throw
export interface RawQiscusActivity {
  id: string | number
  type?: string
  subject?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawQiscusActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  return out
}
