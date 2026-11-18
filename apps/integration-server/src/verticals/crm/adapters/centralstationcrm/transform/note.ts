/**
 * Transform CentralStationCRM "protocol" objects to/from canonical Note.
 *
 * Protocols are the note/comment resource in CentralStationCRM.
 * Wire shape (GET /people/{id}/protocols.json or /companies/{id}/protocols.json):
 * {
 *   protocol: {
 *     id, name, content, badge, user_id, created_by_user_id,
 *     attachable_id, attachable_type,
 *     created_at, updated_at
 *   }
 * }
 *
 * attachable_type: "Person" | "Company" | "Deal" | "Project"
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawCentralStationProtocol {
  id: number | string
  name?: string
  content?: string
  badge?: string
  user_id?: number | string
  created_by_user_id?: number | string
  attachable_id?: number | string
  attachable_type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawCentralStationProtocolWrapper {
  protocol: RawCentralStationProtocol
  [key: string]: unknown
}

export function transformNote(raw: RawCentralStationProtocol): Note {
  const attachableType = raw.attachable_type?.toLowerCase()
  const attachableId = raw.attachable_id != null ? String(raw.attachable_id) : undefined

  return {
    id: String(raw.id),
    content: raw.content ?? raw.name ?? '',
    contact_id: attachableType === 'person' ? attachableId : undefined,
    company_id: attachableType === 'company' ? attachableId : undefined,
    deal_id: (attachableType === 'deal' || attachableType === 'project') ? attachableId : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const protocol: Record<string, unknown> = {}
  if (data.content !== undefined) protocol.content = data.content
  if (data.owner_id !== undefined) protocol.user_id = data.owner_id

  // Set attachable if only one association is provided
  if (data.contact_id !== undefined) {
    protocol.attachable_id = data.contact_id
    protocol.attachable_type = 'Person'
  } else if (data.company_id !== undefined) {
    protocol.attachable_id = data.company_id
    protocol.attachable_type = 'Company'
  } else if (data.deal_id !== undefined) {
    protocol.attachable_id = data.deal_id
    protocol.attachable_type = 'Deal'
  }

  return { protocol }
}
