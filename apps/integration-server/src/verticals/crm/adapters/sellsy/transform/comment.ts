/**
 * Sellsy comment → canonical Note.
 *
 * Sellsy API v2 has no notes resource; its free-text record attached to a
 * company, contact or opportunity is the comment. Source shape: `CommentItem`
 * in the Sellsy API v2 OpenAPI spec
 * (https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml), returned by
 * GET /comments ("Get a list of comments"):
 *
 * - `id`: "Internal Comment ID"
 * - `description`: "Comment content"
 * - `owner`: "Owner of the comment", `{ id, type }` with type `staff` | `contact`
 * - `created` / `updated`: "Creation date of the comment" / "Modification date
 *   of the comment", format date-time (example `1970-01-01T00:00:00+00:00`)
 * - `company_id`: "Company linked to the comment"
 * - `contact_id`: "Contact linked to the comment"
 * - `related`: "Main object related to the comment (limit to 1)", `{ id, type }`
 *   with type enum including `opportunity`
 */
import type { Note } from '../../../schema/note'

export interface RawSellsyComment {
  id: number
  description?: string
  owner?: { id?: number; type?: 'staff' | 'contact' }
  created?: string
  updated?: string
  parent_id?: number | null
  related?: Array<{ id?: number; type?: string }>
  company_id?: number | null
  individual_id?: number | null
  contact_id?: number | null
  [key: string]: unknown
}

export function transformComment(raw: RawSellsyComment): Note {
  if (typeof raw.description !== 'string') {
    throw new Error(`Sellsy comment ${raw.id} has no description (the comment content)`)
  }
  const note: Note = {
    id: String(raw.id),
    content: raw.description,
    metadata: raw,
  }
  if (raw.contact_id != null) note.contact_id = String(raw.contact_id)
  if (raw.company_id != null) note.company_id = String(raw.company_id)
  const related = raw.related?.[0]
  if (related?.type === 'opportunity' && related.id != null) note.deal_id = String(related.id)
  // owner.type is `staff` | `contact`; only a staff owner is a platform user.
  if (raw.owner?.type === 'staff' && raw.owner.id != null) note.owner_id = String(raw.owner.id)
  if (raw.created) note.created_at = raw.created
  if (raw.updated) note.updated_at = raw.updated
  return note
}
