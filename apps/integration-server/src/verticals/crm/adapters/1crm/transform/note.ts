/**
 * Transform 1CRM Note records to/from the canonical Note schema.
 *
 * 1CRM module: Note
 * Key API fields: id, name (subject), description (body), contact_id,
 *   parent_id, parent_type, assigned_user_id, date_entered, date_modified
 *
 * Note: 1CRM Notes have a subject (`name`) and a body (`description`).
 * We concatenate them (subject: body) or fall back to whichever is present.
 */

import type { Note } from '../../../schema/note'
import { toIsoDatetime } from '@opensteward/shared'

export interface Raw1CrmNote {
  id: string
  name?: string
  description?: string
  contact_id?: string
  parent_id?: string
  parent_type?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformNote(raw: Raw1CrmNote): Note {
  // Compose content from subject and body
  const subject = raw.name?.trim() ?? ''
  const body = raw.description?.trim() ?? ''
  let content: string
  if (subject && body) {
    content = `${subject}: ${body}`
  } else {
    content = subject || body
  }

  return {
    id: String(raw.id),
    content,
    contact_id: raw.contact_id ?? undefined,
    owner_id: raw.assigned_user_id ?? undefined,
    created_at: toIsoDatetime(raw.date_entered),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
