/**
 * Respond.io ↔ canonical Note transforms.
 *
 * Respond.io does not expose a notes endpoint in its v2 REST API.
 * These stubs exist so the transform module is complete; the adapter
 * does not expose note methods (the registry returns 501 automatically).
 */
import type { Note } from '../../../schema/note'

export interface RawRespondIoNote {
  id: string | number
  content?: string
  contactId?: string | number
  [key: string]: unknown
}

export function transformNote(raw: RawRespondIoNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.contactId ? String(raw.contactId) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  return out
}
