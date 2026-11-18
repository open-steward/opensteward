/**
 * JobDiva candidate note → canonical Note transform.
 *
 * JobDiva supports notes (called "candidate notes") attached to a
 * candidate record. Wire fields come from the /createCandidateNote
 * endpoint and the note listing within candidate detail responses.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawJobdivaNote {
  /** Internal note ID. */
  noteid?: string | number
  id?: string | number
  /** Note body text. */
  notetext?: string
  note?: string
  content?: string
  /** Candidate (contact) this note belongs to. */
  candidateid?: string | number
  contactid?: string | number
  /** Linked job ID, if any. */
  jobid?: string | number
  /** Author / recruiter ID. */
  ownerid?: string | number
  createdat?: string
  modifiedat?: string
  [key: string]: unknown
}

/** Convert a raw JobDiva note to a canonical Note. Never throws. */
export function transformNote(raw: RawJobdivaNote): Note {
  const id = raw.noteid ?? raw.id
  const contactId = raw.candidateid ?? raw.contactid
  return {
    id: String(id ?? ''),
    content: raw.notetext ?? raw.note ?? raw.content ?? '',
    contact_id: contactId != null ? String(contactId) : undefined,
    deal_id: raw.jobid != null ? String(raw.jobid) : undefined,
    owner_id: raw.ownerid != null ? String(raw.ownerid) : undefined,
    created_at: toIsoDatetime(raw.createdat),
    updated_at: toIsoDatetime(raw.modifiedat),
    metadata: raw,
  }
}

/** Convert a partial canonical Note to a JobDiva createCandidateNote request body. */
export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.notetext = data.content
  if (data.contact_id !== undefined) out.candidateid = data.contact_id
  if (data.deal_id !== undefined) out.jobid = data.deal_id
  return out
}
