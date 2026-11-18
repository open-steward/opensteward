import type { Activity } from '../../../schema/activity'
import { optDate, optKey, optString, requireKey } from '../records'

/** components.schemas.Communication of the Sage CRM 2024 R2 RESTful API reference (fields read here). */
export interface RawSageCrmCommunication {
  Comm_CommunicationId?: number
  Comm_Type?: string
  Comm_Subject?: string
  comm_note?: string
  comm_organizer?: string
  comm_datetime?: string
  Comm_OpportunityId?: number
  Comm_CreatedDate?: string
  Comm_UpdatedDate?: string
  [key: string]: unknown
}

/**
 * `done` is omitted: Comm_Status has no documented value set (the reference's
 * batch example shows only "Pending"). `type` is Comm_Type verbatim (the same
 * example shows "task").
 */
export function transformActivity(raw: RawSageCrmCommunication): Activity {
  const activity: Activity = {
    id: requireKey(raw.Comm_CommunicationId, 'Comm_CommunicationId'),
    metadata: raw,
  }
  const type = optString(raw.Comm_Type)
  if (type) activity.type = type
  const subject = optString(raw.Comm_Subject)
  if (subject) activity.subject = subject
  const note = optString(raw.comm_note)
  if (note) activity.note = note
  const owner = optString(raw.comm_organizer)
  if (owner) activity.owner_id = owner
  const deal = optKey(raw.Comm_OpportunityId)
  if (deal) activity.deal_id = deal
  const due = optDate(raw.comm_datetime)
  if (due) activity.due_date = due
  const created = optDate(raw.Comm_CreatedDate)
  if (created) activity.created_at = created
  const updated = optDate(raw.Comm_UpdatedDate)
  if (updated) activity.updated_at = updated
  return activity
}

// Write mapping below is unchanged by the read rebuild (write methods are out
// of its scope); its field names are not from the documented Communication schema.
export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.acti_type = data.type
  if (data.subject !== undefined) out.acti_subject = data.subject
  if (data.note !== undefined) out.acti_notes = data.note
  if (data.contact_id !== undefined) out.pers_personid = Number(data.contact_id)
  if (data.company_id !== undefined) out.comp_companyid = Number(data.company_id)
  if (data.deal_id !== undefined) out.oppo_opportunityid = Number(data.deal_id)
  if (data.due_date !== undefined) out.acti_duedate = data.due_date
  if (data.done !== undefined) out.acti_done = data.done
  return out
}
