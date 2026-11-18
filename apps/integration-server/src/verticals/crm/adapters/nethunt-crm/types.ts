/**
 * Response shapes of the NetHunt Public REST API (v2), copied from the
 * vendor's OpenAPI document, https://nethunt.com/api/openapi.json (rendered
 * at https://nethunt.com/api/docs). Only the properties this adapter reads
 * are typed; every record is also kept whole in `metadata`.
 */

/** `Folder.role`: "enum": ["contact","company","deal","task"]. */
export type NetHuntFolderRole = 'contact' | 'company' | 'deal' | 'task'

/** components.schemas.Field (only on GET /api/v2/folders/{folderId}). */
export interface NetHuntField {
  id: string
  name: string
  type: string
  /**
   * "Role binding of a built-in system-folder field; absent for regular
   * fields. In the Tasks folder (folder `role: "task"`) the values are:
   * `name`, `description`, `completed`, `dueDate`, `allDay`, `priority`,
   * `assignee`, `creator`, `recordLink`."
   */
  role?: string
  [key: string]: unknown
}

/** components.schemas.Folder. */
export interface NetHuntFolder {
  id: string
  name: string
  role?: NetHuntFolderRole
  createdAt: number
  createdISO: string
  updatedAt: number
  updatedISO: string
  /** "Populated only on GET /folders/{folderId}." */
  fields?: NetHuntField[]
  [key: string]: unknown
}

/** components.schemas.Record. */
export interface NetHuntRecord {
  id: string
  folderId: string
  createdAt: number
  createdISO: string
  updatedAt: number
  updatedISO: string
  /**
   * "Friendly field values keyed by field id (or label when
   * `?fieldKeys=label`). Empty and unset fields are omitted." The `name` key
   * is "the record display name".
   */
  fields: Record<string, unknown>
  [key: string]: unknown
}

/** components.schemas.RecordFilterResult. */
export interface NetHuntRecordFilterResult {
  records: NetHuntRecord[]
  /** "Returned only on the first page (request without `cursor`)". */
  total?: number
  /** "Pagination token for the next page ... Absent on the last page." */
  nextCursor?: string
  [key: string]: unknown
}

/** components.schemas.TimelinePerson. */
export interface NetHuntTimelinePerson {
  name?: string
  email?: string
}

/** components.schemas.CommentTimelineItem. */
export interface NetHuntCommentEvent {
  id: string
  time: number
  timeISO: string
  pinned: boolean
  type: 'comment'
  origin?: string
  creator?: NetHuntTimelinePerson
  text?: string
  [key: string]: unknown
}

/** components.schemas.RecordTimelinePage (events narrowed to `types=comment`). */
export interface NetHuntTimelinePage {
  events: NetHuntCommentEvent[]
  nextCursor?: string
  [key: string]: unknown
}
