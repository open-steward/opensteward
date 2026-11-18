/**
 * OroCRM note ↔ canonical Note transform.
 *
 * OroCRM exposes notes as a separate entity.
 * JSON:API resource type: `notes`
 *
 * Key attributes (GET /api/notes):
 *   message (body), createdAt, updatedAt
 *
 * Key relationships: owner, target (polymorphic — contact / account / opportunity)
 */
import type { Note } from '../../../schema/note'
import type { JsonApiRecord } from '../client'
import { strAttr, relId } from './shared'

export function transformNote(record: JsonApiRecord): Note {
  return {
    id: String(record.id),
    content: strAttr(record, 'message') ?? '',
    owner_id: relId(record, 'owner'),
    created_at: strAttr(record, 'createdAt'),
    updated_at: strAttr(record, 'updatedAt'),
    metadata: { id: record.id, type: record.type, attributes: record.attributes, relationships: record.relationships },
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.content !== undefined) attributes['message'] = data.content
  return {
    data: {
      type: 'notes',
      attributes,
    },
  }
}
