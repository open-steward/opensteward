/**
 * Clarify notes — stored as comments on records.
 *
 * The add-comment API returns: id, body (content), entity_id, entity_type,
 * owner_id, created_at, updated_at.
 */

import type { Note } from '../../../schema/note'

export interface RawClarifyNote {
  id: string | number
  body?: string
  /** Entity the note is attached to */
  entity_id?: string
  /** "person" | "company" | "deal" */
  entity_type?: string
  owner_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawClarifyNote): Note {
  const entityType = raw.entity_type
  return {
    id: String(raw.id),
    content: raw.body ?? '',
    contact_id: entityType === 'person' ? (raw.entity_id ?? undefined) : undefined,
    company_id: entityType === 'company' ? (raw.entity_id ?? undefined) : undefined,
    deal_id: entityType === 'deal' ? (raw.entity_id ?? undefined) : undefined,
    owner_id: raw.owner_id ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  if (data.contact_id !== undefined) {
    out.entity_id = data.contact_id
    out.entity_type = 'person'
  } else if (data.company_id !== undefined) {
    out.entity_id = data.company_id
    out.entity_type = 'company'
  } else if (data.deal_id !== undefined) {
    out.entity_id = data.deal_id
    out.entity_type = 'deal'
  }
  return out
}
