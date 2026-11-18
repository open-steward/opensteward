import type { Comment } from '../../../schema/comment'
import {
  htmlText,
  many2oneId,
  meta,
  odooIso,
  strOrUndef,
  x2manyIds,
  type Many2one,
} from '../values'

/**
 * A `mail.message` row (addons/mail/models/mail_message.py, 19.0; the same
 * fields in 14.0):
 *   date = fields.Datetime('Date', default=fields.Datetime.now)
 *   body = fields.Html('Contents', default='', sanitize_style=True)
 *   attachment_ids = fields.Many2many('ir.attachment', …)
 *   model = fields.Char('Related Document Model')
 *   res_id = fields.Many2oneReference('Related Document ID', model_field='model')
 *   message_type = fields.Selection([('email', 'Incoming Email'), ('comment', 'Comment'), …])
 *   subtype_id = fields.Many2one('mail.message.subtype', 'Subtype', …)
 *   is_internal = fields.Boolean('Employee Only', help='Hide to public / portal users, …')
 *   author_id = fields.Many2one('res.partner', 'Author', …)
 *
 * The author is the log-access column `create_uid` (a res.users, the id space
 * of task assignees and of listUsers), as odoo-crm's notes read it:
 * `author_id` is a res.partner, a different id space, so it goes to metadata.
 * `partner_ids` are "Recipients", not mentions, so `mentions` stays empty.
 */
export interface RawOdooMessage {
  id: number
  body?: string | false
  model?: string | false
  res_id?: number | false
  message_type?: string | false
  subtype_id?: Many2one
  is_internal?: boolean
  author_id?: Many2one
  create_uid?: Many2one
  attachment_ids?: number[]
  date?: string | false
  create_date?: string | false
  write_date?: string | false
}

export const MESSAGE_FIELDS = [
  'id',
  'body',
  'model',
  'res_id',
  'message_type',
  'subtype_id',
  'is_internal',
  'author_id',
  'create_uid',
  'attachment_ids',
  'date',
  'create_date',
  'write_date',
]

export function transformComment(raw: RawOdooMessage): Comment {
  const model = strOrUndef(raw.model)
  const resId = typeof raw.res_id === 'number' && raw.res_id > 0 ? String(raw.res_id) : undefined
  // `date` defaults to now, so every message has one; create_date is the fallback.
  const createdAt = odooIso(raw.date) ?? odooIso(raw.create_date)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: model === 'project.task' ? resId : undefined,
    projectId: model === 'project.project' ? resId : undefined,
    authorId: many2oneId(raw.create_uid) ?? '',
    body: htmlText(raw.body) ?? '',
    mentions: [],
    attachmentCount: Array.isArray(raw.attachment_ids)
      ? x2manyIds(raw.attachment_ids).length
      : undefined,
    // The canonical field is required; the epoch marks "unknown", as asana does.
    createdAt: createdAt ?? new Date(0).toISOString(),
    updatedAt: odooIso(raw.write_date),
    platform: 'odoo-project',
    metadata: meta({
      authorPartnerId: many2oneId(raw.author_id),
      subtypeId: many2oneId(raw.subtype_id),
      isInternal: typeof raw.is_internal === 'boolean' ? String(raw.is_internal) : undefined,
    }),
    raw,
  }
}
