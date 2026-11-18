/**
 * SalesNexus sales-opportunity (deal) transforms.
 *
 * SalesNexus calls them "sales opportunities". They are identified by a
 * `sales-id` string and carry field-values keyed by numeric field ID.
 * Status codes: 0 = open, 1 = won, 2 = lost.
 *
 * Transforms NEVER throw — missing optional fields return undefined.
 */
import type { Deal } from '../../../schema/deal'
import { SALES_FIELDS } from '../constants'

/** Raw SalesNexus sales opportunity as returned by get-sales. */
export interface RawSalesnexusDeal {
  'sales-id': string
  'field-values'?: Record<string, string | null | undefined>
  [key: string]: unknown
}

function fv(raw: RawSalesnexusDeal, id: string): string | undefined {
  const v = raw['field-values']?.[id]
  return v == null || v === '' ? undefined : v
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

/** Map SalesNexus status code string to canonical vocabulary. */
function statusLabel(code: string | undefined): string | undefined {
  if (code === '0') return 'open'
  if (code === '1') return 'won'
  if (code === '2') return 'lost'
  return code
}

export function transformDeal(raw: RawSalesnexusDeal): Deal {
  const contactId = fv(raw, SALES_FIELDS.CONTACT_ID)
  const amountStr = fv(raw, SALES_FIELDS.AMOUNT)
  // SalesNexus stores deal amounts in major currency units (e.g. 15000 = $15,000).
  // Canonical representation is integer minor units (cents), so multiply by 100.
  const majorAmount = amountStr != null ? parseFloat(amountStr) : undefined
  const minorAmount =
    majorAmount != null && !isNaN(majorAmount)
      ? Math.round(majorAmount * 100)
      : undefined

  return {
    id: String(raw['sales-id']),
    title: fv(raw, SALES_FIELDS.TITLE) ?? '',
    status: statusLabel(fv(raw, SALES_FIELDS.STATUS)),
    stage: fv(raw, SALES_FIELDS.STAGE),
    contact_ids: contactId ? [contactId] : undefined,
    owner_id: fv(raw, SALES_FIELDS.OWNER_ID),
    close_date: toIso(fv(raw, SALES_FIELDS.CLOSE_DATE)),
    value: minorAmount != null ? { amount: minorAmount, currency: 'USD' } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build a `sales-field-data` map for create-sales-opp / update-sales.
 */
export function untransformDeal(data: Partial<Deal>): Record<string, string> {
  const out: Record<string, string> = {}
  if (data.title != null) out[SALES_FIELDS.TITLE] = data.title
  if (data.contact_ids?.[0] != null) out[SALES_FIELDS.CONTACT_ID] = data.contact_ids[0]
  if (data.stage != null) out[SALES_FIELDS.STAGE] = data.stage
  // Canonical amount is integer minor units (cents); SalesNexus expects major units (dollars).
  if (data.value?.amount != null) out[SALES_FIELDS.AMOUNT] = String(data.value.amount / 100)
  if (data.close_date != null) out[SALES_FIELDS.CLOSE_DATE] = data.close_date
  if (data.status != null) {
    const codeMap: Record<string, string> = { open: '0', won: '1', lost: '2' }
    out[SALES_FIELDS.STATUS] = codeMap[data.status] ?? data.status
  }
  return out
}
