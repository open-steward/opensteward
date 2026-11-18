/**
 * CashCtrl tax code → canonical TaxRate transform.
 *
 * Tax codes are managed via GET /tax/list.json and GET /tax/read.json.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#tax
 */
import type { TaxRate } from '../../../schema/taxrate'

/**
 * CashCtrl tax record as returned by GET /tax/read.json
 * and listed via GET /tax/list.json.
 */
export interface CashCtrlTax {
  id: number
  name?: string | null
  /** Tax percentage (e.g. 7.7 for 7.7%). */
  percentage?: number | null
  /** Account credited with the collected tax. */
  accountId?: number | null
  /** When true the tax code is deactivated. */
  isInactive?: boolean | null
  [key: string]: unknown
}

export function transformTaxRate(raw: CashCtrlTax): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.percentage ?? undefined,
    isActive: !raw.isInactive,
    metadata: raw as Record<string, unknown>,
  }
}
