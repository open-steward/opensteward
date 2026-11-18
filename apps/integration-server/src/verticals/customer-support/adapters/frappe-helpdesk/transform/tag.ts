/**
 * Frappe Helpdesk does not have a first-class Tag entity.
 * HD Ticket Priority records are the closest analog and are surfaced as tags
 * when listTags is called.
 *
 * Key HD Ticket Priority fields:
 *   name          — document ID / priority label (e.g. "Low", "Medium", "High", "Urgent")
 *   integer_value — sort order (lower = higher priority)
 *   description   — optional description
 *   disabled      — boolean
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFrappePriority {
  name: string
  description?: string | null
  integer_value?: number | null
  disabled?: number | boolean
  [key: string]: unknown
}

export function transformTag(raw: RawFrappePriority): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'frappe-helpdesk',
    metadata: strMap({ description: raw.description, integerValue: raw.integer_value }),
    raw,
  }
}
