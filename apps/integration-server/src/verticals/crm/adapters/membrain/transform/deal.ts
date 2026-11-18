import { Iso4217Currency } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { guid, required, text } from '../fields'

/**
 * An Opportunity (Sales Project) as GET /opportunities/ and
 * GET /opportunities/{Id} return it
 * (https://www.membrain.com/developers/api-documentation, "GET /opportunities/"
 * Example Result).
 *
 * `ProcessId` is the Sales Process (Pipeline.id): "For ProcessId you can get
 * the currently available sales processes using GET /salesProcesses/."
 * `Status` is one of "Open, Won, Archived" (the Status filter's values).
 */
export interface RawMembrainDeal {
  Id: string
  Name: string
  CompanyId?: string
  OpportunityOwnerId?: string
  ProcessId?: string
  ProcessCurrentStageId?: string
  ProcessCurrentStageName?: string
  Status?: string
  ValueInCurrency?: string
  ValueCurrencyCode?: string
  [key: string]: unknown
}

/**
 * The deal's value in its own currency. The example's `ValueCurrencyCode` is
 * "" and the docs' currency list includes codes such as "X1K" that are not
 * ISO 4217, so a value whose code is absent or not ISO 4217 is omitted rather
 * than given a currency.
 */
function dealValue(raw: RawMembrainDeal): Deal['value'] {
  const code = text(raw.ValueCurrencyCode)
  const amountText = text(raw.ValueInCurrency)
  if (code === undefined || amountText === undefined) return undefined
  if (!Iso4217Currency.safeParse(code).success) return undefined
  const amount = Number(amountText)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return { amount, currency: code }
}

export function transformDeal(raw: RawMembrainDeal): Deal {
  return {
    id: required(raw.Id, 'Id', 'opportunity'),
    title: required(raw.Name, 'Name', 'opportunity'),
    value: dealValue(raw),
    status: text(raw.Status),
    stage: text(raw.ProcessCurrentStageName),
    stage_id: guid(raw.ProcessCurrentStageId),
    pipeline_id: guid(raw.ProcessId),
    company_id: guid(raw.CompanyId),
    owner_id: guid(raw.OpportunityOwnerId),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stage = { id: data.stage_id }
  if (data.pipeline_id !== undefined) out.salesProcess = { id: data.pipeline_id }
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  if (data.close_date !== undefined) out.expectedCloseDate = data.close_date
  return out
}
