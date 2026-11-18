import { Iso4217Currency } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { idFromUrl } from '../url-id'

/**
 * One deal as GET /v1/deals/ and GET /v1/deals/:deal_id/ return it
 * (https://developer.clientify.com/, "List Deals", "Deal Details" and the
 * deal record returned by "Add Products to Deal"). Related records are
 * hyperlinks; `owner` is a display name or an e-mail, not an id.
 */
export interface RawClientifyDeal {
  url?: string
  id: number
  owner?: string | null
  owner_name?: string | null
  name: string
  /** A decimal string, e.g. "766786.00". */
  amount?: string | null
  /** Present on the fuller deal record ("currency": "EUR"). */
  currency?: string | null
  contact?: string | null
  company?: string | null
  created?: string | null
  modified?: string | null
  /** A date, e.g. "2019-03-07". */
  expected_closed_date?: string | null
  status?: number | null
  status_desc?: string | null
  probability?: number | null
  /** e.g. "10%". */
  probability_desc?: string | null
  pipeline_stage?: string | null
  pipeline_stage_desc?: string | null
  pipeline?: string | null
  pipeline_desc?: string | null
  [key: string]: unknown
}

/**
 * "You can also filter the deals by status_id using this values: 1:
 * OPEN_STATUS 2: EXPIRED_STATUS 3: WON_STATUS 4: LOST_STATUS" (Query Deals).
 */
const STATUS: Record<number, string> = { 1: 'open', 2: 'expired', 3: 'won', 4: 'lost' }

function isoDate(date: string | null | undefined): string | undefined {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date}T00:00:00Z`
    : undefined
}

function percent(desc: string | null | undefined): number | undefined {
  const m = typeof desc === 'string' ? /^(\d{1,3})%$/.exec(desc) : null
  if (!m) return undefined
  const n = Number(m[1])
  return n <= 100 ? n : undefined
}

/** Both the amount and a valid ISO 4217 currency, or no value at all. */
function money(raw: RawClientifyDeal): Deal['value'] {
  if (raw.amount == null) return undefined
  const amount = Number(raw.amount)
  const currency = Iso4217Currency.safeParse(raw.currency)
  if (raw.amount === '' || !Number.isFinite(amount) || amount < 0 || !currency.success)
    return undefined
  return { amount, currency: currency.data }
}

export function transformDeal(raw: RawClientifyDeal): Deal {
  const contact = idFromUrl(raw.contact)
  return {
    id: String(raw.id),
    title: raw.name,
    value: money(raw),
    status: raw.status != null ? STATUS[raw.status] : undefined,
    stage: raw.pipeline_stage_desc ?? undefined,
    stage_id: idFromUrl(raw.pipeline_stage),
    pipeline_id: idFromUrl(raw.pipeline),
    contact_ids: contact !== undefined ? [contact] : undefined,
    company_id: idFromUrl(raw.company),
    close_date: isoDate(raw.expected_closed_date),
    probability: percent(raw.probability_desc),
    created_at: raw.created ?? undefined,
    updated_at: raw.modified ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stage = data.stage_id
  if (data.pipeline_id !== undefined) out.pipeline = data.pipeline_id
  if (data.contact_ids?.[0] !== undefined) out.contact = data.contact_ids[0]
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  if (data.close_date !== undefined) out.expected_close_date = data.close_date
  return out
}
