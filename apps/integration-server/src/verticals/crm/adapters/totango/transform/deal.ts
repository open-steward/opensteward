/**
 * Transform between canonical Deal and Totango account plan / opportunity shape.
 *
 * Totango does not have a native "deals" concept in its standard API.
 * We map the account's contract/plan data as the closest equivalent:
 *   - A Totango "account" with contract_value maps to a canonical Deal.
 *   - status_group maps to deal status.
 *   - contract_value is the deal value in major currency units (e.g. USD dollars).
 *
 * Canonical Money.amount is INTEGER MINOR UNITS (cents). We convert:
 *   majorUnits * 100 → minor units when reading from Totango.
 *   minorUnits / 100 → major units when writing to Totango.
 */

import type { Deal } from '../../../schema/deal'

export interface RawTotangoDeal {
  id?: string | number
  name?: string
  account_name?: string
  /** Lifecycle status string (e.g. "Paying", "Trial", "Churn"). */
  status_group?: string
  /**
   * Contract value in major currency units (USD dollars).
   * Totango stores this as a float/integer representing dollars, not cents.
   */
  contract_value?: number | string
  /** ISO 4217 currency code, defaults to USD if absent. */
  currency?: string
  account_id?: string | number
  csm?: string
  /** Epoch milliseconds. */
  create_date?: number | string
  /** Epoch milliseconds. */
  update_date?: number | string
  [key: string]: unknown
}

function epochMsToIso(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  const ms = typeof value === 'string' ? parseInt(value, 10) : value
  if (!Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString()
}

export function transformDeal(raw: RawTotangoDeal): Deal {
  const majorUnits =
    raw.contract_value !== undefined && raw.contract_value !== null
      ? Number(raw.contract_value)
      : undefined
  const minorUnits =
    majorUnits !== undefined && Number.isFinite(majorUnits)
      ? Math.round(majorUnits * 100)
      : undefined

  const currency =
    typeof raw.currency === 'string' && raw.currency.length === 3
      ? (raw.currency.toUpperCase() as string)
      : 'USD'

  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? raw.account_name ?? '',
    value:
      minorUnits !== undefined
        ? { amount: minorUnits, currency }
        : undefined,
    status:
      typeof raw.status_group === 'string' ? raw.status_group.toLowerCase() : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.csm,
    created_at: epochMsToIso(raw.create_date as number | string | undefined),
    updated_at: epochMsToIso(raw.update_date as number | string | undefined),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.csm = data.owner_id
  if (data.value !== undefined) {
    // Convert minor units (cents) → major units (dollars) for Totango.
    out.contract_value = data.value.amount / 100
    out.currency = data.value.currency
  }
  return out
}
