import type { Activity } from '../../../schema/activity'

/**
 * A Dolibarr agenda event as GET /agendaevents and GET /agendaevents/{id}
 * return it: an ActionComm object after AgendaEvents::_cleanObjectDatas().
 *
 * Field names are the ActionComm properties documented in
 * htdocs/comm/action/class/actioncomm.class.php (develop), for example
 *   "@var int Id of the event"                      → id
 *   "@var string Code into parent table llx_c_actioncomm" → type_code
 *   "@var string Agenda event label"                → label
 *   "@var int Date creation record (datec)"         → datec
 *   "@var int Date modification record (tms)"       → datem
 *   "@var int Date action start (datep)"            → datep
 *   "@var int<-1,100> Percentage"                   → percentage
 *   "@var int Id of user owner = fk_user_action into table" → userownerid
 *   "@var int thirdparty id linked to action"       → socid
 * ActionComm::fetch() sets `$this->note_private = $obj->note_private` from
 * `a.note as note_private`, and the API strips `note` ("already in
 * note_private or note_public") and `contact_id`, so neither is read here.
 *
 * Dates are Unix timestamps (seconds) from `$this->db->jdate()`, which yields
 * an empty string for a NULL column.
 */
export interface RawDolibarrAction {
  id?: string | number
  type_code?: string | null
  label?: string | null
  note_private?: string | null
  userownerid?: string | number | null
  socid?: string | number | null
  datep?: number | string | null
  datec?: number | string | null
  datem?: number | string | null
  percentage?: number | string | null
  [key: string]: unknown
}

/** A jdate() Unix timestamp in seconds, or undefined for '' / null / absent. */
function unixToIso(value: number | string | null | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return undefined
  return new Date(seconds * 1000).toISOString()
}

/** ActionComm::create() stores an unset socid / owner as SQL NULL, so null means "no link". */
function linkId(value: string | number | null | undefined): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

/**
 * ActionComm::LibStatut(): -1 is "StatusNotApplicable", 0 "StatusActionToDo",
 * 1..99 "StatusActionInProcess", >= 100 "StatusActionDone".
 */
function doneFromPercentage(value: number | string | null | undefined): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const pct = Number(value)
  if (!Number.isFinite(pct) || pct < 0) return undefined
  return pct >= 100
}

export function transformActivity(raw: RawDolibarrAction): Activity {
  if (raw.id === undefined || raw.id === null || raw.id === '') {
    throw new Error('Dolibarr agenda event has no id')
  }
  return {
    id: String(raw.id),
    type: raw.type_code || undefined,
    subject: raw.label || undefined,
    note: raw.note_private || undefined,
    company_id: linkId(raw.socid),
    owner_id: linkId(raw.userownerid),
    due_date: unixToIso(raw.datep),
    done: doneFromPercentage(raw.percentage),
    created_at: unixToIso(raw.datec),
    updated_at: unixToIso(raw.datem),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out['type_code'] = data.type
  if (data.subject !== undefined) out['label'] = data.subject
  if (data.note !== undefined) out['note'] = data.note
  if (data.contact_id !== undefined) out['fk_contact'] = data.contact_id
  if (data.company_id !== undefined) out['fk_soc'] = data.company_id
  if (data.done !== undefined) out['done'] = data.done ? 1 : 0
  return out
}
