/**
 * Transform Eudonet note rows (Tab 500) to canonical Note.
 *
 * Key Eudonet field DescIds for notes (table 500):
 *   501 — Content (body text)
 *   502 — Contact ID (linked)
 *   503 — Company ID (linked)
 *   504 — Deal ID (linked)
 *   590 — CreatedAt (ISO 8601)
 *   591 — UpdatedAt (ISO 8601)
 */

import type { Note } from '../../../schema/note'
import { toIsoDatetime } from '@opensteward/shared'
import type { EudonetRow } from '../client'
import { fieldValue } from '../client'
import {
  FIELD_NOTE_CONTENT,
  FIELD_NOTE_CONTACT_ID,
  FIELD_NOTE_COMPANY_ID,
  FIELD_NOTE_DEAL_ID,
  FIELD_NOTE_CREATED_AT,
  FIELD_NOTE_UPDATED_AT,
} from '../constants'

export function transformNote(row: EudonetRow): Note {
  return {
    id:         String(row.FileId),
    content:    fieldValue(row, FIELD_NOTE_CONTENT) ?? '',
    contact_id: fieldValue(row, FIELD_NOTE_CONTACT_ID),
    company_id: fieldValue(row, FIELD_NOTE_COMPANY_ID),
    deal_id:    fieldValue(row, FIELD_NOTE_DEAL_ID),
    created_at: toIsoDatetime(fieldValue(row, FIELD_NOTE_CREATED_AT)),
    updated_at: toIsoDatetime(fieldValue(row, FIELD_NOTE_UPDATED_AT)),
    metadata:   row as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): { DescId: number; Value: unknown }[] {
  const fields: { DescId: number; Value: unknown }[] = []
  if (data.content    !== undefined) fields.push({ DescId: FIELD_NOTE_CONTENT,    Value: data.content })
  if (data.contact_id !== undefined) fields.push({ DescId: FIELD_NOTE_CONTACT_ID, Value: data.contact_id })
  if (data.company_id !== undefined) fields.push({ DescId: FIELD_NOTE_COMPANY_ID, Value: data.company_id })
  if (data.deal_id    !== undefined) fields.push({ DescId: FIELD_NOTE_DEAL_ID,    Value: data.deal_id })
  return fields
}
