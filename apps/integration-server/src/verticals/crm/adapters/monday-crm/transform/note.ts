import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'
import type { MondayUpdate } from '../client'

export function transformNote(raw: MondayUpdate, contactId?: string): Note {
  return {
    id: raw.id,
    content: raw.body,
    contact_id: contactId,
    owner_id: raw.creator_id || undefined,
    created_at: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
