import type { TaxRate } from '../../../schema/taxrate'
import { toUtcDate } from '../../shared/transform'

export interface XeroTaxComponent {
  Name: string
  Rate: number
  IsCompound: boolean
}

export interface XeroTaxRate {
  Name: string
  TaxType: string
  CanApplyToAssets: boolean
  CanApplyToEquity: boolean
  CanApplyToExpenses: boolean
  CanApplyToLiabilities: boolean
  CanApplyToRevenue: boolean
  DisplayTaxRate: number
  EffectiveRate: number
  Status: 'ACTIVE' | 'DELETED'
  TaxComponents: XeroTaxComponent[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: XeroTaxRate): TaxRate {
  return {
    id: raw.TaxType,
    name: raw.Name || undefined,
    rate: raw.EffectiveRate,
    isActive: raw.Status === 'ACTIVE',
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
