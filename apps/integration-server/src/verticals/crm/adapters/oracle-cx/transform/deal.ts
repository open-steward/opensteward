import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

/**
 * One item of GET /crmRestApi/resources/{version}/opportunities, reading only
 * the attributes of `opportunities-item-response`
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-opportunities-get.html).
 */
export interface RawOracleCxDeal {
  /** "The unique identifier of the opportunity." */
  OptyId: number | string
  /** "The name of the opportunity." */
  Name: string
  /** "The estimated revenue amount from the opportunity." */
  Revenue?: number | null
  /** "The currency code associated with the opportunity." */
  CurrencyCode?: string | null
  /** "The code indicating the status of the opportunity." (lookup MOO_OPTY_STATUS) */
  StatusCode?: string | null
  /** "The current sales stage of the opportunity." */
  SalesStage?: string | null
  /** "The unique identifier for the sales stage of the opportunity." */
  SalesStageId?: number | string | null
  /** "The unique identifier of the sales account that owns the opportunity." */
  TargetPartyId?: number | string | null
  /** "The unique identifier of a valid employee resource who owns and manages the opportunity." */
  OwnerResourcePartyId?: number | string | null
  /** "The date when the opportunity is expected to close." (format: date) */
  EffectiveDate?: string | null
  /** "The estimated probability of winning the opportunity." */
  WinProb?: number | null
  /** "The date and time when the record was created." */
  CreationDate?: string | null
  /** "The date when the record was last updated." */
  LastUpdateDate?: string | null
  [key: string]: unknown
}

/** Attributes requested with `fields=`, all named in `opportunities-item-response`. */
export const DEAL_FIELDS = [
  'OptyId',
  'Name',
  'Revenue',
  'CurrencyCode',
  'StatusCode',
  'SalesStage',
  'SalesStageId',
  'TargetPartyId',
  'OwnerResourcePartyId',
  'EffectiveDate',
  'WinProb',
  'CreationDate',
  'LastUpdateDate',
].join(',')

function idOf(v: number | string | null | undefined): string | undefined {
  return v != null ? String(v) : undefined
}

export function transformDeal(raw: RawOracleCxDeal): Deal {
  return {
    id: String(raw.OptyId),
    title: raw.Name,
    // Money only when both the amount and its currency are on the record.
    value:
      typeof raw.Revenue === 'number' && raw.CurrencyCode
        ? { amount: raw.Revenue, currency: raw.CurrencyCode }
        : undefined,
    status: raw.StatusCode ?? undefined,
    stage: raw.SalesStage ?? undefined,
    stage_id: idOf(raw.SalesStageId),
    company_id: idOf(raw.TargetPartyId),
    owner_id: idOf(raw.OwnerResourcePartyId),
    close_date: toIsoDatetime(raw.EffectiveDate),
    probability: raw.WinProb ?? undefined,
    created_at: toIsoDatetime(raw.CreationDate),
    updated_at: toIsoDatetime(raw.LastUpdateDate),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Name = data.title
  if (data.value?.amount !== undefined) out.Revenue = data.value.amount
  if (data.value?.currency !== undefined) out.CurrencyCode = data.value.currency
  if (data.stage_id !== undefined) out.StatusCode = data.stage_id
  if (data.company_id !== undefined) out.TargetPartyId = data.company_id
  if (data.owner_id !== undefined) out.OwnerPartyId = data.owner_id
  if (data.close_date !== undefined) out.CloseDate = data.close_date
  if (data.probability !== undefined) out.WinProb = data.probability
  return out
}
