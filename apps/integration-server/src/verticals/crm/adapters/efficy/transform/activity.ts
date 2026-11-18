import type { Activity } from '../../../schema/activity'

/**
 * `Appointment_GET` / `Appointment_GetByID` from
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (GET /api/v1/meetings, GET /api/v1/meetings/{id}). Only documented fields.
 * Activities are read from meetings only, so every activity here is a
 * `meeting`. The spec's conversations also carry task, call and mail
 * channels, but its Conversation tag describes them as "ticket Conversations
 * stored in the CRM" and "directly linked to a ticket", and Conversation_GET
 * has no contact, company or opportunity field to attach them by.
 */
export interface RawEfficyActivity {
  crm_id?: string
  title?: string
  description?: string
  start_date?: string
  end_date?: string
  /** "The duration of the meeting in seconds (e.g., 1800 for 30 minutes or 3600 for 1 hour)." */
  duration?: number
  status?: string
  organizer?: string
  creation_date?: string
  last_update_date?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawEfficyActivity): Activity {
  if (!raw.crm_id) throw new Error('Efficy meeting has no crm_id')
  return {
    id: raw.crm_id,
    type: 'meeting',
    subject: raw.title || undefined,
    note: raw.description || undefined,
    due_date: raw.start_date,
    duration_minutes:
      typeof raw.duration === 'number' && raw.duration >= 0
        ? Math.round(raw.duration / 60)
        : undefined,
    created_at: raw.creation_date,
    updated_at: raw.last_update_date,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.ACTIONTYPE = data.type
  if (data.subject !== undefined) out.SUBJECT = data.subject
  if (data.note !== undefined) out.NOTES = data.note
  if (data.contact_id !== undefined) out.K_CONTACT = Number(data.contact_id)
  if (data.company_id !== undefined) out.K_COMPANY = Number(data.company_id)
  if (data.deal_id !== undefined) out.K_OPPORTUNITY = Number(data.deal_id)
  if (data.due_date !== undefined) out.DUEDATE = data.due_date
  if (data.done !== undefined) out.DONE = data.done
  return out
}
