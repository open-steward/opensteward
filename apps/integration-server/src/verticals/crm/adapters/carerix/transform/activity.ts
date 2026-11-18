/**
 * Transform Carerix CRToDo records to the canonical Activity type.
 *
 * Carerix's to-do entity is CRToDo (capital D): "CRToDo and it's virtual
 * entities like CRTask, CRNote, CRMeeting, CRCampaign supports email resource"
 * (https://help.carerix.com/en/articles/9464648-carerix-rest-api, v0.8.2).
 *
 * Attribute names come from Carerix's own REST client, whose entity classes
 * are "GENERATED AUTOMATICALLY USING REST API ENTITY DESCRIBE SERVICE"
 * (github.com/carerix/cxrest-client, src/Carerix/Api/Rest/Entity/AbstractEntity/
 * AbstractCRToDo.php):
 *   todoID            NSNumber, the identifier key ("Patch for non-standard
 *                     identifier key. Expected toDoID. Actual todoID.", CRToDo.php)
 *   subject           NSString
 *   deadline          NSCalendarDate
 *   todoTypeKey       NSNumber (CRToDo.php TODO_TYPE_KEY_* constants)
 *   creationDate      NSCalendarDate
 *   modificationDate  NSCalendarDate
 *   notes             NSString (CRToDo.php)
 *
 * Relationships (owner, toEmployee, toCompany, ...) are nested entity
 * elements, not scalar ids, and their JSON form is not documented, so they
 * are left in metadata. No completion flag is documented (`status` is an
 * undocumented integer), so `done` is not set.
 */

import type { Activity } from '../../../schema/activity'

export interface RawCarerixTodo {
  todoID?: string | number
  subject?: string | null
  notes?: string | null
  todoTypeKey?: string | number | null
  deadline?: string | null
  creationDate?: string | null
  modificationDate?: string | null
  [key: string]: unknown
}

/** CRToDo.php: TODO_TYPE_KEY_TASK = 0, _MEETING = 1, _EMAIL = 3, _NOTE = 4, ... */
const TODO_TYPES: Readonly<Record<string, string>> = {
  '0': 'task',
  '1': 'meeting',
  '3': 'email',
  '4': 'note',
  '5': 'draft',
  '22': 'campaign',
  '25': 'system_activity',
  '33': 'newsletter',
  '34': 'edition',
}

const CARERIX_TIME_ZONE = 'Europe/Amsterdam'

const AMSTERDAM = new Intl.DateTimeFormat('en-US', {
  timeZone: CARERIX_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Offset of Europe/Amsterdam from UTC at `utcMs`, in milliseconds. */
function amsterdamOffsetMs(utcMs: number): number {
  const p: Record<string, number> = {}
  for (const part of AMSTERDAM.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  return wall - Math.floor(utcMs / 1000) * 1000
}

/**
 * Carerix dates: "All dates and timestamps are in “Europe/Amsterdam” timezone
 * (+0200) unless noted otherwise." and "YYYY-MM-DD HH:MM:SS +0200"
 * (https://help.carerix.com/en/articles/9464648-carerix-rest-api). Example
 * responses there also carry offset-less values ("2014-02-20 09:22:47"),
 * which are Amsterdam wall-clock time, not UTC.
 */
export function carerixDateToIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*([+-])(\d{2}):?(\d{2}))?$/.exec(
      value.trim(),
    )
  if (!m) return undefined
  const [, y, mo, d, h, mi, s, sign, oh, om] = m
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
  let utc: number
  if (sign) {
    const offset = (Number(oh) * 60 + Number(om)) * 60_000
    utc = sign === '+' ? wall - offset : wall + offset
  } else {
    utc = wall - amsterdamOffsetMs(wall)
    utc = wall - amsterdamOffsetMs(utc)
  }
  const date = new Date(utc)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function text(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function transformActivity(raw: RawCarerixTodo): Activity {
  if (raw.todoID === undefined || raw.todoID === null || raw.todoID === '') {
    throw new Error('Carerix CRToDo record has no todoID')
  }
  const out: Activity = { id: String(raw.todoID), metadata: raw as Record<string, unknown> }
  const type = raw.todoTypeKey != null ? TODO_TYPES[String(raw.todoTypeKey)] : undefined
  if (type) out.type = type
  const subject = text(raw.subject)
  if (subject) out.subject = subject
  const note = text(raw.notes)
  if (note) out.note = note
  const due = carerixDateToIso(raw.deadline)
  if (due) out.due_date = due
  const created = carerixDateToIso(raw.creationDate)
  if (created) out.created_at = created
  const updated = carerixDateToIso(raw.modificationDate)
  if (updated) out.updated_at = updated
  return out
}

/**
 * Write-side mapping, out of scope for the CRToDo read rebuild and left as it
 * was: its field names (todoText, description, todoDate, isDone, toUser,
 * toTodoTypeNode) are not CRToDo attributes.
 */
export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.todoText = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.todoDate = data.due_date
  if (data.owner_id !== undefined) out.toUser = data.owner_id
  if (data.contact_id !== undefined) out.toEmployee = data.contact_id
  if (data.company_id !== undefined) out.toCompany = data.company_id
  if (data.done !== undefined) out.isDone = data.done
  if (data.type !== undefined) out.toTodoTypeNode = data.type
  return out
}
