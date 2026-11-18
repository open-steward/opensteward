import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'
import { many2oneId, many2oneName, strOrUndef, stripHtml, type Many2one } from '../values'

/**
 * A `mail.activity` row as `search_read` returns it for {@link ACTIVITY_FIELDS}.
 * Fields from addons/mail/models/mail_activity.py (Odoo 19.0):
 *
 *   res_model = fields.Char('Related Document Model', …)
 *   res_id = fields.Many2oneReference(string='Related Document ID', …)
 *   activity_type_id = fields.Many2one('mail.activity.type', string='Activity Type', …)
 *   summary = fields.Char('Summary')
 *   note = fields.Html('Note', …)
 *   date_deadline = fields.Date('Due Date', …)
 *   user_id = fields.Many2one('res.users', 'Assigned to', …)
 */
export interface RawOdooActivity {
  id: number
  summary?: string | false
  note?: string | false
  date_deadline?: string | false
  res_model?: string | false
  res_id?: number | false
  user_id?: Many2one
  activity_type_id?: Many2one
  create_date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export const ACTIVITY_FIELDS = [
  'id',
  'summary',
  'note',
  'date_deadline',
  'res_model',
  'res_id',
  'user_id',
  'activity_type_id',
  'create_date',
  'write_date',
]

export function transformActivity(raw: RawOdooActivity): Activity {
  const resModel = strOrUndef(raw.res_model)
  const resId = typeof raw.res_id === 'number' && raw.res_id ? String(raw.res_id) : undefined
  const noteRaw = strOrUndef(raw.note)

  return {
    id: String(raw.id),
    type: many2oneName(raw.activity_type_id),
    subject: strOrUndef(raw.summary),
    note: noteRaw ? stripHtml(noteRaw) : undefined,
    due_date: toIsoDatetime(strOrUndef(raw.date_deadline)),
    owner_id: many2oneId(raw.user_id),
    contact_id: resModel === 'res.partner' ? resId : undefined,
    deal_id: resModel === 'crm.lead' ? resId : undefined,
    created_at: toIsoDatetime(strOrUndef(raw.create_date)),
    updated_at: toIsoDatetime(strOrUndef(raw.write_date)),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.summary = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.due_date !== undefined) out.date_deadline = data.due_date
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.contact_id !== undefined) {
    out.res_model = 'res.partner'
    out.res_id = Number(data.contact_id)
  }
  return out
}
