import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Raw Workfront `note` (objCode `NOTE`) record — comments/updates on objects. */
export interface RawWorkfrontNote {
  ID: string
  noteText?: string
  subject?: string
  ownerID?: string
  projectID?: string
  taskID?: string | null
  opTaskID?: string | null
  parentNoteID?: string | null
  entryDate?: string
  [key: string]: unknown
}

export function transformComment(raw: RawWorkfrontNote, taskId?: string, projectId?: string): Comment {
  const resolvedTaskId = taskId ?? pickStr(raw.taskID) ?? pickStr(raw.opTaskID)
  return {
    id: raw.ID,
    externalId: raw.ID,
    taskId: resolvedTaskId,
    projectId: projectId ?? pickStr(raw.projectID),
    authorId: pickStr(raw.ownerID) ?? '',
    body: pickStr(raw.noteText) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.entryDate) ?? new Date(0).toISOString(),
    platform: 'workfront',
    metadata: strMap({
      subject: raw.subject,
      parentNoteID: raw.parentNoteID,
    }),
    raw,
  }
}
