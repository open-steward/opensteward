/**
 * Transform between canonical CRM Activity and CAS genesisWorld Appointment
 * objects (object type: appointment).
 *
 * Appointments cover meetings, calls, and scheduled tasks.  The GGUID is the
 * primary identifier; Subject maps to the canonical `subject`; the StartDate
 * field maps to `due_date`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawCasAppointment {
  /** GGUID — primary identifier */
  GWGUID?: string
  /** Appointment subject / title */
  Subject?: string
  /** Optional longer description / notes */
  Note?: string
  /** Appointment type (meeting, call, …) — may be a numeric code or string */
  AppointmentType?: string | number
  /** Start date-time (ISO 8601) */
  StartDate?: string
  /** End date-time (ISO 8601) */
  EndDate?: string
  /** Done/completed flag */
  Done?: boolean | number | string
  /** Duration in minutes */
  Duration?: number | string
  /** Owning user GGUID */
  UserGGUID?: string
  /** Linked contact GGUID */
  ContactGGUID?: string
  /** Linked company GGUID */
  CompanyGGUID?: string
  /** Creation timestamp (ISO 8601) */
  CreateDate?: string
  /** Last-modification timestamp (ISO 8601) */
  UpdateDate?: string
  [key: string]: unknown
}

const APPOINTMENT_TYPE_MAP: Record<string, string> = {
  '1': 'meeting',
  '2': 'call',
  '3': 'email',
  '4': 'task',
}

function resolveType(raw: RawCasAppointment): string | undefined {
  const t = String(raw.AppointmentType ?? '')
  return APPOINTMENT_TYPE_MAP[t] ?? (t || undefined)
}

function parseDone(raw: RawCasAppointment): boolean | undefined {
  if (raw.Done === undefined || raw.Done === null) return undefined
  if (typeof raw.Done === 'boolean') return raw.Done
  if (typeof raw.Done === 'number') return raw.Done !== 0
  return String(raw.Done).toLowerCase() === 'true' || raw.Done === '1'
}

function parseDuration(raw: RawCasAppointment): number | undefined {
  if (raw.Duration == null) return undefined
  const n = parseInt(String(raw.Duration), 10)
  return isNaN(n) ? undefined : n
}

export function transformActivity(raw: RawCasAppointment): Activity {
  return {
    id: String(raw.GWGUID ?? ''),
    type: resolveType(raw),
    subject: raw.Subject ?? undefined,
    note: raw.Note ?? undefined,
    owner_id: raw.UserGGUID ? String(raw.UserGGUID) : undefined,
    contact_id: raw.ContactGGUID ? String(raw.ContactGGUID) : undefined,
    company_id: raw.CompanyGGUID ? String(raw.CompanyGGUID) : undefined,
    due_date: toIsoDatetime(raw.StartDate),
    done: parseDone(raw),
    duration_minutes: parseDuration(raw),
    created_at: toIsoDatetime(raw.CreateDate),
    updated_at: toIsoDatetime(raw.UpdateDate),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.note !== undefined) out.Note = data.note
  if (data.due_date !== undefined) out.StartDate = data.due_date
  if (data.owner_id !== undefined) out.UserGGUID = data.owner_id
  if (data.contact_id !== undefined) out.ContactGGUID = data.contact_id
  if (data.company_id !== undefined) out.CompanyGGUID = data.company_id
  if (data.done !== undefined) out.Done = data.done
  if (data.duration_minutes !== undefined) out.Duration = data.duration_minutes
  // Map canonical type strings back to CAS numeric codes where known
  if (data.type !== undefined) {
    const rev = Object.entries({ '1': 'meeting', '2': 'call', '3': 'email', '4': 'task' })
      .find(([, v]) => v === data.type)
    out.AppointmentType = rev ? Number(rev[0]) : data.type
  }
  return out
}
