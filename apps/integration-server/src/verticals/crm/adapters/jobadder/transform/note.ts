/**
 * JobAdder Note ↔ canonical Note.
 *
 * JobAdder exposes notes on both candidates and jobs.
 * This transform covers both shapes — the relevant entity ID
 * (candidateId or jobId) is passed in from the caller.
 *
 * API fields (camelCase on the wire):
 *   noteId, text (body), noteType.{ noteTypeId, name },
 *   createdBy.{ userId, name }, createdAt, updatedAt,
 *   candidate.{ candidateId }, job.{ jobId }
 *
 * Compound ID scheme:
 *   Notes in JobAdder have no direct /notes/{id} endpoint. They are only
 *   accessible via parent-scoped paths:
 *     /candidates/{candidateId}/notes/{noteId}
 *     /jobs/{jobId}/notes/{noteId}
 *   To round-trip through getNote/updateNote/deleteNote we encode the
 *   canonical Note.id as "candidate:{candidateId}:{noteId}" or
 *   "job:{jobId}:{noteId}". Use parseNoteCompoundId to decode.
 */

import type { Note } from '../../../schema/note'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawJobAdderNote {
  noteId: number | string
  text?: string
  noteType?: {
    noteTypeId?: number | string
    name?: string
    [key: string]: unknown
  }
  createdBy?: {
    userId?: number | string
    name?: string
    [key: string]: unknown
  }
  candidate?: {
    candidateId?: number | string
    [key: string]: unknown
  }
  job?: {
    jobId?: number | string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

/**
 * Decode a compound Note.id produced by transformNote.
 *
 * Returns { parentType, parentId, noteId } on success, or null if the id
 * is not in compound form (e.g. a plain integer string).
 */
export function parseNoteCompoundId(
  id: string,
): { parentType: 'candidate' | 'job'; parentId: string; noteId: string } | null {
  const parts = id.split(':')
  if (parts.length === 3 && (parts[0] === 'candidate' || parts[0] === 'job')) {
    return {
      parentType: parts[0] as 'candidate' | 'job',
      parentId: parts[1]!,
      noteId: parts[2]!,
    }
  }
  return null
}

/**
 * Optional parent context to supplement the raw note when the API does not
 * embed the parent entity inline (e.g. notes listed from
 * /candidates/{id}/notes may not repeat the candidateId in each note object).
 */
export interface NoteParentContext {
  parentType: 'candidate' | 'job'
  parentId: string
}

export function transformNote(raw: RawJobAdderNote, parentCtx?: NoteParentContext): Note {
  const noteId = String(raw.noteId)

  // Prefer inline parent fields from the raw note; fall back to context.
  const candidateId = raw.candidate?.candidateId != null
    ? String(raw.candidate.candidateId)
    : (parentCtx?.parentType === 'candidate' ? parentCtx.parentId : undefined)
  const jobId = raw.job?.jobId != null
    ? String(raw.job.jobId)
    : (parentCtx?.parentType === 'job' ? parentCtx.parentId : undefined)

  // Build compound ID so getNote/updateNote/deleteNote can route to the
  // correct parent-scoped endpoint without additional API calls.
  let compoundId: string
  if (candidateId != null) {
    compoundId = `candidate:${candidateId}:${noteId}`
  } else if (jobId != null) {
    compoundId = `job:${jobId}:${noteId}`
  } else {
    // No parent context available — fall back to plain noteId. Callers that
    // need getNote/updateNote/deleteNote will be unable to route; this is
    // safer than fabricating an incorrect path.
    compoundId = noteId
  }

  return {
    id: compoundId,
    content: raw.text ?? '',
    contact_id: candidateId,
    deal_id: jobId,
    owner_id: raw.createdBy?.userId != null ? String(raw.createdBy.userId) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  return out
}
