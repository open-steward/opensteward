/**
 * lemlist Activity transform.
 *
 * lemlist activity record (from /activities or webhook payloads):
 *   _id, type, teamId, createdAt,
 *   leadId, leadEmail,
 *   sendUserId, sendUserEmail,
 *   campaignId, sequenceId
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawLemlistActivity {
  _id: string
  type?: string
  teamId?: string
  createdAt?: string
  leadId?: string
  leadEmail?: string
  sendUserId?: string
  sendUserEmail?: string
  campaignId?: string
  sequenceId?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawLemlistActivity): Activity {
  return {
    id: String(raw._id),
    type: raw.type ?? undefined,
    subject: raw.type ?? undefined,
    contact_id: raw.leadId ? String(raw.leadId) : undefined,
    owner_id: raw.sendUserId ? String(raw.sendUserId) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
