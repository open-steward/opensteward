import type { Activity } from '../../../schema/activity'
import { requireUuid, text } from './fields'

/**
 * Barantum has no single activities list. Its CRM API has three activity
 * modules, each read with `POST /api/get_list_data` and a `module` of
 * "Calls", "Meetings" or "Tasks" (Barantum CRM collection,
 * https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5: "[Calls] Get
 * Data", "[Meetings] Get Data", "[Tasks] Get Data", Expected Response).
 *
 * A canonical activity id is `<module>:<uuid>` (`calls:6487def6-…`): the
 * uuid alone does not say which module `getActivity` has to ask.
 *
 * Not mapped, on purpose: the date fields ("2022-07-28 15:19:50") carry no
 * zone and the docs name none; `*_owner` and `users_name` are names; and
 * `*_status` ("Planned", "Held") has no documented list of values that says
 * which ones are done.
 */

interface RawBarantumActivityLinks {
  related_contacts_uuid?: string | null
  related_org_uuid?: string | null
  related_deals_uuid?: string | null
  [key: string]: unknown
}

export interface RawBarantumCall extends RawBarantumActivityLinks {
  calls_uuid: string
  calls_name?: string | null
  calls_description?: string | null
  calls_duration_hours?: string | number | null
  calls_duration_minutes?: string | number | null
}

export interface RawBarantumMeeting extends RawBarantumActivityLinks {
  meetings_uuid: string
  meetings_name?: string | null
  meetings_description?: string | null
  meetings_duration_hours?: string | number | null
  meetings_duration_minutes?: string | number | null
}

export interface RawBarantumTask extends RawBarantumActivityLinks {
  tasks_uuid: string
  tasks_name?: string | null
  tasks_description?: string | null
}

/** The three activity modules, in the order `listActivities` streams them. */
export const ACTIVITY_MODULES = [
  { module: 'Calls', prefix: 'calls', type: 'call', uuidField: 'calls_uuid' },
  { module: 'Meetings', prefix: 'meetings', type: 'meeting', uuidField: 'meetings_uuid' },
  { module: 'Tasks', prefix: 'tasks', type: 'task', uuidField: 'tasks_uuid' },
] as const

export type ActivityModule = (typeof ACTIVITY_MODULES)[number]['module']

/** The module and uuid behind a canonical activity id, or undefined when it names no module. */
export function parseActivityId(
  id: string,
): { spec: (typeof ACTIVITY_MODULES)[number]; uuid: string } | undefined {
  const sep = id.indexOf(':')
  if (sep <= 0 || sep === id.length - 1) return undefined
  const prefix = id.slice(0, sep)
  const spec = ACTIVITY_MODULES.find((m) => m.prefix === prefix)
  return spec ? { spec, uuid: id.slice(sep + 1) } : undefined
}

function whole(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Hours and minutes, both documented and both set, as minutes. */
function duration(hours: unknown, minutes: unknown): number | undefined {
  const h = whole(hours)
  const m = whole(minutes)
  return h === undefined || m === undefined ? undefined : h * 60 + m
}

function links(raw: RawBarantumActivityLinks) {
  return {
    contact_id: text(raw.related_contacts_uuid),
    company_id: text(raw.related_org_uuid),
    deal_id: text(raw.related_deals_uuid),
  }
}

export function transformCall(raw: RawBarantumCall): Activity {
  return {
    id: `calls:${requireUuid(raw, 'calls_uuid', 'Calls')}`,
    type: 'call',
    subject: text(raw.calls_name),
    note: text(raw.calls_description),
    ...links(raw),
    duration_minutes: duration(raw.calls_duration_hours, raw.calls_duration_minutes),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformMeeting(raw: RawBarantumMeeting): Activity {
  return {
    id: `meetings:${requireUuid(raw, 'meetings_uuid', 'Meetings')}`,
    type: 'meeting',
    subject: text(raw.meetings_name),
    note: text(raw.meetings_description),
    ...links(raw),
    duration_minutes: duration(raw.meetings_duration_hours, raw.meetings_duration_minutes),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTask(raw: RawBarantumTask): Activity {
  return {
    id: `tasks:${requireUuid(raw, 'tasks_uuid', 'Tasks')}`,
    type: 'task',
    subject: text(raw.tasks_name),
    note: text(raw.tasks_description),
    ...links(raw),
    metadata: raw as Record<string, unknown>,
  }
}

/** A row of `module`, transformed by that module's transform. */
export function transformActivityRow(
  module: ActivityModule,
  raw: Record<string, unknown>,
): Activity {
  switch (module) {
    case 'Calls':
      return transformCall(raw as RawBarantumCall)
    case 'Meetings':
      return transformMeeting(raw as RawBarantumMeeting)
    case 'Tasks':
      return transformTask(raw as RawBarantumTask)
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.is_done = data.done
  return out
}

// ── Legacy: createActivity only ──────────────────────────────────────────────
//
// createActivity (a write method, out of scope for the read rebuild) still
// POSTs to the undocumented https://app.barantum.com/api/v1/activities and
// parses its response with the shape below, which no Barantum doc describes.
// Nothing on the read path uses it.

export interface RawBarantumLegacyActivity {
  id: string | number
  type?: string
  subject?: string
  description?: string
  contact_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner_id?: string | number
  due_date?: string
  is_done?: boolean | number | string
  duration?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

function toBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true'
  return undefined
}

const TYPE_MAP: Record<string, string> = {
  call: 'call',
  email: 'email',
  meeting: 'meeting',
  task: 'task',
  deadline: 'deadline',
  lunch: 'lunch',
}

export function transformLegacyActivity(raw: RawBarantumLegacyActivity): Activity {
  const rawType = typeof raw.type === 'string' ? raw.type.toLowerCase() : undefined
  const type = rawType ? (TYPE_MAP[rawType] ?? rawType) : undefined
  const durationMin =
    raw.duration !== undefined ? Math.trunc(Number(raw.duration)) || undefined : undefined

  return {
    id: String(raw.id),
    type,
    subject: raw.subject || undefined,
    note: raw.description || undefined,
    contact_id: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    company_id: raw.company_id !== undefined ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id !== undefined ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id !== undefined ? String(raw.owner_id) : undefined,
    due_date: toIso(raw.due_date),
    done: toBool(raw.is_done),
    duration_minutes: durationMin,
    created_at: toIso(raw.created_at),
    updated_at: toIso(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
