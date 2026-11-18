/**
 * OroCRM task ↔ canonical Activity transform.
 *
 * OroCRM exposes tasks as a separate entity.
 * JSON:API resource type: `tasks`
 *
 * Key attributes (GET /api/tasks):
 *   subject, description, dueDate, status (open/closed),
 *   priority, createdAt, updatedAt
 *
 * Key relationships: owner
 */
import type { Activity } from '../../../schema/activity'
import type { JsonApiRecord } from '../client'
import { strAttr, relId } from './shared'

export function transformActivity(record: JsonApiRecord): Activity {
  const status = strAttr(record, 'status')

  return {
    id: String(record.id),
    type: 'task',
    subject: strAttr(record, 'subject'),
    note: strAttr(record, 'description'),
    owner_id: relId(record, 'owner'),
    due_date: strAttr(record, 'dueDate'),
    done: status === 'closed',
    created_at: strAttr(record, 'createdAt'),
    updated_at: strAttr(record, 'updatedAt'),
    metadata: { id: record.id, type: record.type, attributes: record.attributes, relationships: record.relationships },
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.subject !== undefined) attributes['subject'] = data.subject
  if (data.note !== undefined) attributes['description'] = data.note
  if (data.due_date !== undefined) attributes['dueDate'] = data.due_date
  if (data.done !== undefined) attributes['status'] = data.done ? 'closed' : 'open'
  return {
    data: {
      type: 'tasks',
      attributes,
    },
  }
}
