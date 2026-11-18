import type { Activity } from '../../../schema/activity'

/**
 * LACRM does not have a dedicated Activity resource. This file is included
 * for structural completeness. The index.ts does not implement any Activity
 * methods — they all return 501 via the registry.
 */
export interface RawLacrmActivity {
  id: string
  [key: string]: unknown
}

export function transformActivity(raw: RawLacrmActivity): Activity {
  return {
    id: raw.id,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  return out
}
