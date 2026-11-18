/**
 * Transforms between Simplicate CRM appointment records and the canonical
 * Activity schema.
 *
 * Backing endpoint: GET|POST|PUT|DELETE /crm/appointment
 * Docs: https://developer.simplicate.com/docs/api/v2/crm/
 *
 * A Simplicate "appointment" maps cleanly onto the canonical Activity:
 *   subject        → subject
 *   note           → note
 *   activity_type  → type   (e.g. "call", "meeting", "task")
 *   person_id      → contact_id
 *   organization_id → company_id
 *   project_id     → deal_id  (sales/sales is the Deal backing, best-effort)
 *   employee_id    → owner_id
 *   start_date     → due_date
 *   is_completed   → done
 *   created_at / updated_at – ISO 8601 timestamps
 */
import type { Activity } from '../../../schema/activity'

export interface RawSimplicateAppointment {
  id: string
  subject?: string
  note?: string
  activity_type?: string
  person_id?: string | null
  organization_id?: string | null
  project_id?: string | null
  employee_id?: string | null
  start_date?: string | null
  end_date?: string | null
  is_completed?: boolean
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawSimplicateAppointment): Activity {
  return {
    id: String(raw.id),
    type: raw.activity_type ?? undefined,
    subject: raw.subject ?? undefined,
    note: raw.note ?? undefined,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    company_id: raw.organization_id != null ? String(raw.organization_id) : undefined,
    deal_id: raw.project_id != null ? String(raw.project_id) : undefined,
    owner_id: raw.employee_id != null ? String(raw.employee_id) : undefined,
    due_date: raw.start_date ?? undefined,
    done: raw.is_completed ?? false,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.activity_type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.person_id = data.contact_id
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.deal_id !== undefined) out.project_id = data.deal_id
  if (data.owner_id !== undefined) out.employee_id = data.owner_id
  if (data.due_date !== undefined) out.start_date = data.due_date
  if (data.done !== undefined) out.is_completed = data.done
  return out
}
