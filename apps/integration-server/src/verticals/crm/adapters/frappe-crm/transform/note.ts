/**
 * Transform Frappe CRM FCRM Note → canonical Note.
 *
 * Frappe CRM stores notes as "FCRM Note" documents:
 *   name               — Frappe doc name
 *   title              — short title
 *   content            — rich text body
 *   reference_doctype  — "CRM Lead" | "CRM Deal" | …
 *   reference_docname  — the linked doc's name
 *   creation           — ISO datetime
 *   modified           — ISO datetime
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawFrappeNote {
  name: string
  title?: string
  content?: string
  reference_doctype?: string
  reference_docname?: string
  creation?: string
  modified?: string
  [key: string]: unknown
}

export function transformNote(raw: RawFrappeNote): Note {
  const refType = raw.reference_doctype ?? ''
  const refName = raw.reference_docname ? String(raw.reference_docname) : undefined

  return {
    id: String(raw.name),
    content: raw.content ?? raw.title ?? '',
    contact_id: refType === 'CRM Lead' ? refName : undefined,
    deal_id: refType === 'CRM Deal' ? refName : undefined,
    created_at: toIsoDatetime(raw.creation),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) {
    out.reference_doctype = 'CRM Lead'
    out.reference_docname = data.contact_id
  } else if (data.deal_id !== undefined) {
    out.reference_doctype = 'CRM Deal'
    out.reference_docname = data.deal_id
  }
  return out
}
