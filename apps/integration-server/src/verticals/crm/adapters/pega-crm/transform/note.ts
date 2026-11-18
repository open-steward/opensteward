/**
 * Transform Pega CRM interaction note records to canonical Note.
 *
 * Pega Sales Automation stores notes / interaction records under the
 * PegaCRM-Work-Interaction class or as embedded data within contact/
 * account records. Notes are accessed via data pages or case endpoints.
 *
 * Key fields:
 *   pzInsKey         — case system key (primary identifier)
 *   pyID             — business key
 *   NoteContent      — note body text
 *   pyOwner          — owning operator ID (author)
 *   ContactID        — linked contact identifier
 *   AccountID        — linked account identifier
 *   OpportunityID    — linked opportunity (deal) identifier
 *   pxCreateDateTime — ISO 8601 creation timestamp
 *   pxUpdateDateTime — ISO 8601 last-updated timestamp
 */

import type { Note } from '../../../schema/note'
import { parsePegaDatetime } from '../utils'

export interface RawPegaNote {
  pzInsKey?: string
  pyID?: string
  NoteContent?: string
  Content?: string
  pyNote?: string
  pyOwner?: string
  ContactID?: string
  AccountID?: string
  OpportunityID?: string
  pxCreateDateTime?: string
  pxUpdateDateTime?: string
  pxObjClass?: string
  [key: string]: unknown
}

export function transformNote(raw: RawPegaNote): Note {
  return {
    id: String(raw.pzInsKey ?? raw.pyID ?? ''),
    content: raw.NoteContent ?? raw.Content ?? raw.pyNote ?? '',
    contact_id: raw.ContactID ? String(raw.ContactID) : undefined,
    company_id: raw.AccountID ? String(raw.AccountID) : undefined,
    deal_id: raw.OpportunityID ? String(raw.OpportunityID) : undefined,
    owner_id: raw.pyOwner ?? undefined,
    created_at: parsePegaDatetime(raw.pxCreateDateTime),
    updated_at: parsePegaDatetime(raw.pxUpdateDateTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  if (data.content !== undefined) content.NoteContent = data.content
  if (data.owner_id !== undefined) content.pyOwner = data.owner_id
  if (data.contact_id !== undefined) content.ContactID = data.contact_id
  if (data.company_id !== undefined) content.AccountID = data.company_id
  if (data.deal_id !== undefined) content.OpportunityID = data.deal_id
  return { content }
}
