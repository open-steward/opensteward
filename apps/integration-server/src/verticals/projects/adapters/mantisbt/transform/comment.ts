/**
 * MantisBT note → canonical Comment transform.
 *
 * MantisBT calls comments "notes". REST has no GET for notes: they are the
 * `notes` array of GET /issues/{id}. Over REST each note is built by
 * mci_issue_note_data_as_array
 * (https://raw.githubusercontent.com/mantisbt/mantisbt/master/api/soap/mc_issue_api.php):
 *   id, reporter {id, name, real_name, email}, text,
 *   view_state {id, name, label}, attachments [...],
 *   type ('note' | 'reminder' | 'timelog'), created_at, updated_at
 *
 * A note id alone cannot be read back (no note route exists), so the
 * canonical id is `{issueId}:{noteId}`; `externalId` is the note id.
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface EnumRef {
  id?: number
  name?: string
  label?: string
  [key: string]: unknown
}

interface AccountRef {
  id?: number
  name?: string
  real_name?: string
  email?: string
  [key: string]: unknown
}

export interface RawMantisbtNote {
  id?: number
  text?: string
  view_state?: EnumRef | null
  reporter?: AccountRef | null
  attachments?: unknown[] | null
  type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(
  raw: RawMantisbtNote,
  issueId: string,
  projectId: string | undefined,
): Comment {
  if (raw.id == null) throw new Error(`MantisBT note on issue ${issueId} has no id`)
  const noteId = String(raw.id)
  if (raw.reporter?.id == null) throw new Error(`MantisBT note ${noteId} has no reporter id`)
  const createdAt = toIso(raw.created_at)
  if (!createdAt) throw new Error(`MantisBT note ${noteId} has no created_at`)
  return {
    id: `${issueId}:${noteId}`,
    externalId: noteId,
    taskId: issueId,
    projectId,
    authorId: String(raw.reporter.id),
    body: pickStr(raw.text) ?? '',
    mentions: [],
    ...(Array.isArray(raw.attachments) ? { attachmentCount: raw.attachments.length } : {}),
    createdAt,
    updatedAt: toIso(raw.updated_at),
    platform: 'mantisbt',
    metadata: strMap({ viewState: raw.view_state?.name, type: raw.type }),
    raw,
  }
}
