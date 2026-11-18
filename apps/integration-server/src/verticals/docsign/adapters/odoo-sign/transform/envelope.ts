import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import {
  idList,
  many2oneId,
  many2oneName,
  meta,
  odooIso,
  strOrUndef,
  type Many2one,
} from '../values'

/**
 * A `sign.request` row. Odoo Sign is Enterprise-only and its source is not
 * public, so every field name here is one Odoo's own published data writes on
 * the model — github.com/odoo/industry (19.0 and master branches), e.g.
 * museum/demo/sign_request.xml, summer_camps/demo/sign_request.xml,
 * interior_design/demo/sign_request.xml, industry_lawyer/demo/sign_request.xml:
 *   <record model="sign.request">
 *     <field name="template_id" ref="…"/>  <field name="subject">…</field>
 *     <field name="reference">…</field>    <field name="state">signed</field>
 *     <field name="validity" eval="DateTime.now() + timedelta(days=2)"/>
 *     <field name="last_reminder" …/>      <field name="request_item_ids" eval="[Command.create({…})]"/>
 * plus the automatic fields (see values.ts). The shared client asks
 * fields_get first, so a field a server lacks is simply absent here.
 */
export interface RawOdooSignRequest {
  id: number
  display_name?: string | false
  subject?: string | false
  reference?: string | false
  state?: string | false
  template_id?: Many2one
  request_item_ids?: number[] | false
  validity?: string | false
  last_reminder?: string | false
  create_uid?: Many2one
  create_date?: string | false
  write_date?: string | false
}

export const SIGN_REQUEST_FIELDS = [
  'id',
  'display_name',
  'subject',
  'reference',
  'state',
  'template_id',
  'request_item_ids',
  'validity',
  'last_reminder',
  'create_uid',
  'create_date',
  'write_date',
]

/**
 * The `state` values Odoo's own data sets on sign.request: 'sent'
 * (interior_design, master), 'signed' (museum, sport_events, industry_lawyer)
 * and 'shared' (summer_camps, a request whose one item is still 'sent').
 * The full selection is not published, so any other value
 * — and 'shared', whose meaning Odoo does not document — is 'unknown', with
 * the Odoo value kept in metadata.state.
 */
const STATE: Record<string, EnvelopeStatus> = {
  sent: 'sent',
  signed: 'completed',
}

export function transformEnvelope(raw: RawOdooSignRequest, documentIds: string[] = []): Envelope {
  const state = strOrUndef(raw.state)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    status: (state && STATE[state]) || 'unknown',
    subject:
      strOrUndef(raw.subject) ?? strOrUndef(raw.reference) ?? strOrUndef(raw.display_name) ?? '',
    // create_uid: "Stores who created the record, Many2one to a res.users".
    senderId: many2oneId(raw.create_uid),
    senderName: many2oneName(raw.create_uid),
    // Odoo publishes no signing-order field on sign.request.
    signingOrder: 'parallel',
    signerIds: idList(raw.request_item_ids).map(String),
    documentIds,
    templateId: many2oneId(raw.template_id),
    createdAt: odooIso(raw.create_date),
    expiresAt: odooIso(raw.validity),
    updatedAt: odooIso(raw.write_date),
    platform: 'odoo-sign',
    metadata: meta({
      state,
      reference: strOrUndef(raw.reference),
      templateName: many2oneName(raw.template_id),
      lastReminder: odooIso(raw.last_reminder),
    }),
    raw,
  }
}
