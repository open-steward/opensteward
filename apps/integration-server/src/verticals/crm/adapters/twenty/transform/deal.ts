import type { Deal } from '../../../schema/deal'
import { present, recordId, type RawTwentyRecord } from '../records'

/**
 * Twenty "opportunities" (OpportunityWorkspaceEntity, twentyhq/twenty
 * packages/twenty-server/src/modules/opportunity/standard-objects/opportunity.workspace-entity.ts):
 *   name: string
 *   amount: CurrencyMetadata | null   ({ amountMicros, currencyCode })
 *   closeDate: Date | null            (DATE_TIME)
 *   stage: string                     (SELECT: NEW, SCREENING, MEETING, PROPOSAL, CUSTOMER)
 *   pointOfContactId, companyId, ownerId: string | null (MANY_TO_ONE join columns)
 */
export interface RawTwentyOpportunity extends RawTwentyRecord {
  name?: string | null
  amount?: { amountMicros?: number | null; currencyCode?: string | null } | null
  closeDate?: string | null
  stage?: string | null
  pointOfContactId?: string | null
  companyId?: string | null
  ownerId?: string | null
}

/** Twenty's CurrencyMetadata stores the amount in micros (millionths of a unit). */
const MICROS_PER_UNIT = 1_000_000

function money(amount: RawTwentyOpportunity['amount']): Deal['value'] {
  const micros = amount?.amountMicros
  const currency = present(amount?.currencyCode)
  if (typeof micros !== 'number' || !Number.isFinite(micros) || micros < 0 || !currency) {
    return undefined
  }
  return { amount: micros / MICROS_PER_UNIT, currency }
}

export function transformDeal(raw: RawTwentyOpportunity): Deal {
  const contact = present(raw.pointOfContactId)
  return {
    id: recordId(raw, 'opportunity'),
    title: raw.name ?? '',
    value: money(raw.amount),
    stage: present(raw.stage),
    company_id: present(raw.companyId),
    contact_ids: contact ? [contact] : undefined,
    owner_id: present(raw.ownerId),
    close_date: present(raw.closeDate),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) {
    out.amount = {
      amountMicros: Math.round(data.value.amount * 1_000_000),
      currencyCode: data.value.currency ?? 'EUR',
    }
  }
  if (data.status !== undefined) out.stage = data.status
  if (data.stage_id !== undefined) out.pipelineStepId = data.stage_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.pointOfContactId = data.contact_ids[0]
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
