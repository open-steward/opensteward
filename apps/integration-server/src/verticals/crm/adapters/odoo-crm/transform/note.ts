import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'
import { many2oneId, strOrUndef, stripHtml, type Many2one } from '../values'

/**
 * A `mail.message` row with `message_type = 'comment'`, as `search_read`
 * returns it for {@link NOTE_FIELDS}. Fields from
 * addons/mail/models/mail_message.py (Odoo 19.0):
 *
 *   date = fields.Datetime('Date', …)
 *   body = fields.Html('Contents', default='', …)
 *   model = fields.Char('Related Document Model')
 *   res_id = fields.Many2oneReference('Related Document ID', model_field='model')
 *
 * `create_uid` is the log-access column "Stores who created the record,
 * Many2one to a res.users" (ORM reference) — the same id space as every other
 * `owner_id` here. `author_id` is a `res.partner`, so it is not used as one.
 */
export interface RawOdooNote {
  id: number
  body?: string | false
  model?: string | false
  res_id?: number | false
  create_uid?: Many2one
  date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export const NOTE_FIELDS = ['id', 'body', 'model', 'res_id', 'create_uid', 'date', 'write_date']

export function transformNote(raw: RawOdooNote): Note {
  const model = strOrUndef(raw.model)
  const resId = typeof raw.res_id === 'number' && raw.res_id ? String(raw.res_id) : undefined
  const body = strOrUndef(raw.body)

  return {
    id: String(raw.id),
    content: body ? stripHtml(body) : '',
    contact_id: model === 'res.partner' ? resId : undefined,
    deal_id: model === 'crm.lead' ? resId : undefined,
    owner_id: many2oneId(raw.create_uid),
    created_at: toIsoDatetime(strOrUndef(raw.date)),
    updated_at: toIsoDatetime(strOrUndef(raw.write_date)),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = { message_type: 'comment' }
  if (data.content !== undefined) out.body = data.content
  if (data.contact_id !== undefined) {
    out.model = 'res.partner'
    out.res_id = Number(data.contact_id)
  } else if (data.deal_id !== undefined) {
    out.model = 'crm.lead'
    out.res_id = Number(data.deal_id)
  }
  if (data.owner_id !== undefined) out.author_id = Number(data.owner_id)
  return out
}
