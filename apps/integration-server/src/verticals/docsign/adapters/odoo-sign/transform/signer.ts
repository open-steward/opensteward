import type { Signer, SignerStatus } from '../../../schema/signer'
import {
  emailOrUndef,
  many2oneId,
  many2oneName,
  meta,
  odooIso,
  strOrUndef,
  type Many2one,
} from '../values'

/**
 * A `sign.request.item` row: one signer of a sign.request. Its fields are the
 * ones Odoo's own data writes when it creates a request's items
 * (github.com/odoo/industry 19.0 and master, <industry>/demo/sign_request.xml):
 *   'request_item_ids': [Command.create({
 *       'partner_id': ref('res_partner_15'),     # res.partner
 *       'role_id': ref('sign_item_role_6'),      # sign.item.role ("Artist", "Customer", …)
 *       'state': 'completed',
 *       'signer_email': 'tomas.rivera@test.com',
 *       'signing_date': (DateTime.now() - timedelta(days=15)),
 *   })]
 * plus the automatic fields (see values.ts). The item's link back to its
 * request is not in that data, so the adapter finds it through the request's
 * `request_item_ids` instead of naming an inverse field.
 */
export interface RawOdooSignRequestItem {
  id: number
  display_name?: string | false
  partner_id?: Many2one
  role_id?: Many2one
  state?: string | false
  signer_email?: string | false
  signing_date?: string | false
  create_date?: string | false
  write_date?: string | false
}

export const SIGN_REQUEST_ITEM_FIELDS = [
  'id',
  'display_name',
  'partner_id',
  'role_id',
  'state',
  'signer_email',
  'signing_date',
  'create_date',
  'write_date',
]

/**
 * The item `state` values Odoo's data sets: 'completed' next to a signing_date
 * on a 'signed' request (museum, sport_events, industry_lawyer), and 'sent'
 * on 'sent' / 'shared' requests (interior_design, summer_camps). Anything else
 * is 'unknown', with the Odoo value kept in metadata.state.
 */
const STATE: Record<string, SignerStatus> = {
  sent: 'sent',
  completed: 'signed',
}

export function transformSigner(raw: RawOdooSignRequestItem, envelopeId: string): Signer {
  const state = strOrUndef(raw.state)
  const status: SignerStatus = (state && STATE[state]) || 'unknown'
  const email = emailOrUndef(raw.signer_email)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    envelopeId,
    ...(email ? { email } : {}),
    name:
      many2oneName(raw.partner_id) ??
      strOrUndef(raw.display_name) ??
      strOrUndef(raw.signer_email) ??
      '',
    // Every sign.request.item is a party asked to sign; its Odoo role (a
    // sign.item.role such as "Customer") is a name, kept in metadata.
    role: 'signer',
    status,
    // summer_camps sets a signing_date on an item still 'sent', so the date is
    // only a signature time once the item is completed.
    signedAt: status === 'signed' ? odooIso(raw.signing_date) : undefined,
    platform: 'odoo-sign',
    metadata: meta({
      state,
      partnerId: many2oneId(raw.partner_id),
      roleId: many2oneId(raw.role_id),
      roleName: many2oneName(raw.role_id),
    }),
    raw,
  }
}
