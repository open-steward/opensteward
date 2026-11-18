import type { Note } from '../../../schema/note'
import { related, required } from '../fields'

/**
 * A Note is an Activity of Type "Note": GET /activities/ "allows you to
 * search for Appointments, Tasks, Notes, Calls and Emails", and its `Type`
 * filter is "One of All, Task, Appointment, Call, Note, Email"
 * (https://www.membrain.com/developers/api-documentation).
 */
export interface RawMembrainNote {
  Id: string
  Type?: string
  Contents: string
  Relateds?: unknown
  [key: string]: unknown
}

export function transformNote(raw: RawMembrainNote): Note {
  if (typeof raw.Contents !== 'string') throw new Error('Membrain note: response has no Contents')
  return {
    id: required(raw.Id, 'Id', 'note'),
    content: raw.Contents,
    company_id: related(raw.Relateds, 'Company'),
    deal_id: related(raw.Relateds, 'Opportunity'),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact = { id: data.contact_id }
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.deal_id !== undefined) out.deal = { id: data.deal_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
