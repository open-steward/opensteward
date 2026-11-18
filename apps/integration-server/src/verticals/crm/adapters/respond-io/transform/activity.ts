/**
 * Respond.io ↔ canonical Activity transforms.
 *
 * Respond.io does not expose a standalone activity/task endpoint in its v2
 * REST API. These stubs exist so the transform module is complete; the
 * adapter does not expose activity methods (the registry returns 501 automatically).
 */
import type { Activity } from '../../../schema/activity'

export interface RawRespondIoActivity {
  id: string | number
  type?: string
  subject?: string
  note?: string
  contactId?: string | number
  dueDate?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawRespondIoActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.note,
    contact_id: raw.contactId ? String(raw.contactId) : undefined,
    due_date: raw.dueDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  return out
}
