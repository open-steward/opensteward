import type { Deal } from '../../../schema/deal'
import { isoDate, refId, requireId, text, type SalesmateRef } from '../fields'

/**
 * A Salesmate v4 deal. "Get a deal" (`GET /apis/deal/v4/{id}`) publishes no
 * example body, so the fields are the ones the docs name for this module
 * (Add a deal): "title required String", "status required String … Allowed
 * values: 'Open' , 'Close' , 'Lost'", "stage required String", "pipeline
 * required String", "estimatedCloseDate optional Date", "dealValue optional
 * Decimal", "currency optional String … three-letter ISO currency code, in
 * uppercase"; and from the Search a deal body `deal.owner.id`,
 * `deal.primaryContact.id`, `deal.primaryCompany.id`, `deal.createdAt` and
 * `deal.lastModifiedAt`.
 *
 * `currency` is a code string in the deal request bodies, but the one
 * documented response ("Get a Contact") returns the same field as an object,
 * `"currency": { "code": "USD", "rate": "1.00", "symbol": "$" }`; both
 * representations of that one field are read. With no code, or no numeric
 * value, `value` is omitted rather than defaulted.
 */
export interface RawSalesmateDeal {
  id?: number | string
  title?: string
  dealValue?: number | string | null
  currency?: string | { code?: string } | null
  status?: string
  stage?: string
  pipeline?: string
  primaryContact?: SalesmateRef | null
  primaryCompany?: SalesmateRef | null
  owner?: SalesmateRef | null
  estimatedCloseDate?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

function currencyCode(c: RawSalesmateDeal['currency']): string | undefined {
  const code = typeof c === 'string' ? c : c && typeof c === 'object' ? c.code : undefined
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : undefined
}

function amountOf(v: RawSalesmateDeal['dealValue']): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  return undefined
}

export function transformDeal(raw: RawSalesmateDeal): Deal {
  const title = text(raw.title)
  if (title === undefined) throw new Error('Salesmate deal has no title')
  const amount = amountOf(raw.dealValue)
  const currency = currencyCode(raw.currency)
  const contactId = refId(raw.primaryContact)
  return {
    id: requireId(raw.id, 'deal'),
    title,
    value: amount !== undefined && currency !== undefined ? { amount, currency } : undefined,
    status: text(raw.status),
    stage: text(raw.stage),
    contact_ids: contactId !== undefined ? [contactId] : undefined,
    company_id: refId(raw.primaryCompany),
    owner_id: refId(raw.owner),
    close_date: isoDate(raw.estimatedCloseDate),
    created_at: isoDate(raw.createdAt),
    updated_at: isoDate(raw.lastModifiedAt),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.dealValue = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact = data.contact_ids[0]
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
