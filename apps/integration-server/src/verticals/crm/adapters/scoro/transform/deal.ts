import type { Deal } from '../../../schema/deal'
import type { Money } from '../../../schema/shared'
import { idOf, isoWithOffset, nonEmpty, requiredId } from '../fields'

/**
 * A Scoro quote, mapped to Deal. Fields from the Quotes table at
 * https://api.scoro.com/api/v2:
 *
 *   id            Integer        "Document ID"
 *   quote_name    String         "Name of the quote. If quote_name is empty then
 *                                default value of company_name + quote is returned."
 *   sum           Decimal (15,2) "Total sum after discounts without VAT."
 *   currency      String         "Used currency."
 *   status        String         "Status of the document(approved, completed,
 *                                declined, incomplete, pending, ready)"
 *   company_id    Integer        "ID of the related client."
 *   person_id     Integer        "ID of the related contact person."
 *   owner_id      Integer        "User ID of the user that is responsible for the document."
 *   modified_date Datetime (YYYY-mm-dd HH:ii:ss)
 *   created_date  Datetime (YYYY-mm-dd HH:ii:ss)
 *
 * The two dates carry no offset, which the reference says means "site default
 * timezone" — a zone the API never states — so they stay in metadata only.
 * estimated_closing_date and deadline are dates, not instants, and `close_date`
 * is an instant, so neither is mapped either.
 */
export interface RawScoroDeal {
  id?: number | string
  quote_name?: string | null
  sum?: number | string | null
  currency?: string | null
  status?: string | null
  company_id?: number | string | null
  person_id?: number | string | null
  owner_id?: number | string | null
  created_date?: string | null
  modified_date?: string | null
  [key: string]: unknown
}

/** `sum` with `currency`, only when both are documented values. */
function quoteValue(raw: RawScoroDeal): Money | undefined {
  const amount =
    typeof raw.sum === 'number'
      ? raw.sum
      : typeof raw.sum === 'string' && raw.sum.trim() !== ''
        ? Number(raw.sum)
        : NaN
  const currency = raw.currency
  if (!Number.isFinite(amount) || amount < 0) return undefined
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined
  return { amount, currency }
}

export function transformDeal(raw: RawScoroDeal): Deal {
  const title = nonEmpty(raw.quote_name)
  if (title === undefined) {
    throw Object.assign(new Error('Scoro quote has no quote_name'), {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  }
  const personId = idOf(raw.person_id)
  return {
    id: requiredId(raw.id, 'quote'),
    title,
    value: quoteValue(raw),
    status: nonEmpty(raw.status),
    company_id: idOf(raw.company_id),
    contact_ids: personId !== undefined ? [personId] : undefined,
    owner_id: idOf(raw.owner_id),
    created_at: isoWithOffset(raw.created_date),
    updated_at: isoWithOffset(raw.modified_date),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.sum = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.close_date !== undefined) out.deadline = data.close_date
  return out
}
