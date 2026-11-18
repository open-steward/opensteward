import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * Raw Mixmax sequence recipient object (GET /v1/sequences/:id/recipients).
 * Mixmax does not expose a dedicated "activities" resource; sequence
 * recipients (contacts enrolled in a sales sequence) are the closest
 * analogue and are mapped to the canonical Activity type.
 *
 * Docs: https://developer.mixmax.com/reference/sequencesidrecipients
 */
export interface RawMixmaxSequenceRecipient {
  _id?: string
  id?: string
  email?: string
  sequenceId?: string
  status?: string
  createdAt?: string | number
  updatedAt?: string | number
  [key: string]: unknown
}

export function transformActivity(raw: RawMixmaxSequenceRecipient): Activity {
  const id = raw._id ?? raw.id ?? ''
  return {
    id: String(id),
    type: 'sequence',
    subject: raw.status ? `Sequence: ${raw.status}` : 'Sequence enrollment',
    contact_id: raw.email ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.contact_id !== undefined) out.email = data.contact_id
  return out
}
