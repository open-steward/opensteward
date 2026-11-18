import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { many2oneId, many2oneName, strOrUndef, type Many2one } from '../values'

/**
 * A `crm.lead` row with `type = 'opportunity'`, as `search_read` returns it
 * for {@link DEAL_FIELDS}. Fields from addons/crm/models/crm_lead.py (Odoo 19.0):
 *
 *   expected_revenue = fields.Monetary('Expected Revenue', currency_field='company_currency', …)
 *   company_currency = fields.Many2one("res.currency", string='Currency', …)
 *   date_deadline    = fields.Date('Expected Closing', …)
 *   partner_id       = fields.Many2one('res.partner', string='Contact', …)
 *   commercial_partner_id = fields.Many2one(…)  # the contact's company, when it has one
 *   team_id          = fields.Many2one('crm.team', string='Sales Team', …)
 *   won_status       = fields.Selection([('won', 'Won'), ('lost', 'Lost'), ('pending', 'Pending')], …)
 */
export interface RawOdooDeal {
  id: number
  name?: string | false
  expected_revenue?: number | false
  company_currency?: Many2one
  date_deadline?: string | false
  stage_id?: Many2one
  team_id?: Many2one
  partner_id?: Many2one
  commercial_partner_id?: Many2one
  user_id?: Many2one
  probability?: number | false
  won_status?: string | false
  create_date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export const DEAL_FIELDS = [
  'id',
  'name',
  'expected_revenue',
  'company_currency',
  'date_deadline',
  'stage_id',
  'team_id',
  'partner_id',
  'commercial_partner_id',
  'user_id',
  'probability',
  'won_status',
  'create_date',
  'write_date',
]

/**
 * `res.currency.name` is `fields.Char(string='Currency', size=3, required=True,
 * help="Currency Code (ISO 4217)")`, and the many2one reads as `[id, name]`.
 */
function currencyCode(v: Many2one | undefined): string | undefined {
  const code = many2oneName(v)
  return code && /^[A-Z]{3}$/.test(code) ? code : undefined
}

export function transformDeal(raw: RawOdooDeal): Deal {
  const title = strOrUndef(raw.name)
  if (!title) throw new Error(`Odoo crm.lead ${raw.id} has no name`)

  const currency = currencyCode(raw.company_currency)
  const amount = typeof raw.expected_revenue === 'number' ? raw.expected_revenue : undefined
  const contactId = many2oneId(raw.partner_id)

  return {
    id: String(raw.id),
    title,
    // Omitted unless both the amount and its currency were read. A negative
    // expected_revenue is omitted too: the canonical MoneySchema holds `amount ≥ 0`.
    value: amount !== undefined && amount >= 0 && currency ? { amount, currency } : undefined,
    status: strOrUndef(raw.won_status),
    stage: many2oneName(raw.stage_id),
    stage_id: many2oneId(raw.stage_id),
    pipeline_id: many2oneId(raw.team_id),
    contact_ids: contactId ? [contactId] : undefined,
    company_id: many2oneId(raw.commercial_partner_id),
    owner_id: many2oneId(raw.user_id),
    close_date: toIsoDatetime(strOrUndef(raw.date_deadline)),
    probability: typeof raw.probability === 'number' ? raw.probability : undefined,
    created_at: toIsoDatetime(strOrUndef(raw.create_date)),
    updated_at: toIsoDatetime(strOrUndef(raw.write_date)),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'opportunity' }
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.expected_revenue = data.value.amount
  if (data.stage_id !== undefined) out.stage_id = Number(data.stage_id)
  if (data.company_id !== undefined) out.partner_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.close_date !== undefined) out.date_deadline = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  return out
}
