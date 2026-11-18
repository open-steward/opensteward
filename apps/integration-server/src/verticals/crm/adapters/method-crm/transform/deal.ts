import type { Deal } from '../../../schema/deal'

/**
 * Method CRM Opportunity table raw record shape.
 *
 * Table name  : Opportunity
 * Key fields  : RecordId, OpportunityName, Amount, CloseDate,
 *               Description, OpportunityStage, OpportunityType,
 *               ContactRecordID, AssignedTo, CreatedDate, ModifiedDate
 *
 * Money: Amount is a decimal major-unit value (e.g. 1250.00 USD).
 * Canonical Deal.value uses integer minor units (cents).
 */
export interface RawMethodOpportunity {
  RecordId: string | number
  OpportunityName?: string
  Amount?: number | string
  CloseDate?: string
  Description?: string
  OpportunityStage?: string
  OpportunityType?: string
  ContactRecordID?: string | number
  AssignedTo?: string
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

/** Convert a major-unit dollar amount to integer minor units (cents). */
function toMinorUnits(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n)) return undefined
  return Math.round(n * 100)
}

/** Convert integer minor units (cents) to major-unit decimal. */
function fromMinorUnits(cents: number | undefined): number | undefined {
  if (cents === undefined) return undefined
  return cents / 100
}

export function transformDeal(raw: RawMethodOpportunity): Deal {
  const amountMinor = toMinorUnits(raw.Amount)

  return {
    id: String(raw.RecordId),
    title:
      typeof raw.OpportunityName === 'string' && raw.OpportunityName.length > 0
        ? raw.OpportunityName
        : '',
    value:
      amountMinor !== undefined
        ? { amount: amountMinor, currency: 'USD' }
        : undefined,
    stage: typeof raw.OpportunityStage === 'string' ? raw.OpportunityStage : undefined,
    contact_ids:
      raw.ContactRecordID !== undefined && raw.ContactRecordID !== null
        ? [String(raw.ContactRecordID)]
        : undefined,
    close_date: typeof raw.CloseDate === 'string' ? raw.CloseDate : undefined,
    created_at: typeof raw.CreatedDate === 'string' ? raw.CreatedDate : undefined,
    updated_at: typeof raw.ModifiedDate === 'string' ? raw.ModifiedDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.OpportunityName = data.title
  if (data.value?.amount !== undefined) out.Amount = fromMinorUnits(data.value.amount)
  if (data.stage !== undefined) out.OpportunityStage = data.stage
  if (data.close_date !== undefined) out.CloseDate = data.close_date
  return out
}
