import type { Deal } from '../../../schema/deal'
import type { Money } from '../../../schema/shared'
import { requireKey, str, zonedIso } from '../octopus'

/**
 * An Opportunity as the Octopus Read returns it for the Scope the adapter sends
 * (https://developer.maximizer.com/reference/octopus-api-docs-objects-opportunity):
 * "Objective" is mandatory; "Status": {"Key", "DisplayValue"};
 * "SalesProcessSetupKey" and "SalesStageSetupKey"; "CurrentSalesStage":
 * {"Description"}; "ForecastRevenue" and "ActualRevenue" "carry a
 * `CurrencyCode` next to `Value`". The AbEntry an Opportunity "is always
 * associated with" is a Company, Individual or Contact, told apart by its Type.
 */
export interface RawMaximizerDeal {
  Key: string
  Objective?: string | null
  Status?: { Key?: unknown; DisplayValue?: string | null } | null
  ForecastRevenue?: { Value?: number | null; CurrencyCode?: string | null } | null
  AbEntry?: { Key?: string | null; Type?: string | null } | null
  SalesProcessSetupKey?: string | null
  SalesStageSetupKey?: string | null
  CurrentSalesStage?: { Description?: string | null } | null
  CloseDate?: string | null
  CreationDate?: string | null
  [key: string]: unknown
}

function forecast(raw: RawMaximizerDeal['ForecastRevenue']): Money | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const amount = raw.Value
  const currency = raw.CurrencyCode
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return undefined
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined
  return { amount, currency }
}

export function transformDeal(raw: RawMaximizerDeal): Deal {
  const id = requireKey(raw, 'Opportunity')
  const title = str(raw.Objective)
  if (!title) throw new Error(`Maximizer opportunity ${id} has no Objective`)
  const abEntry = raw.AbEntry && typeof raw.AbEntry === 'object' ? raw.AbEntry : undefined
  const abKey = str(abEntry?.Key)
  const person = abEntry?.Type === 'Contact' || abEntry?.Type === 'Individual'
  return {
    id,
    title,
    value: forecast(raw.ForecastRevenue),
    status: str(raw.Status?.DisplayValue),
    stage: str(raw.CurrentSalesStage?.Description),
    stage_id: str(raw.SalesStageSetupKey),
    pipeline_id: str(raw.SalesProcessSetupKey),
    company_id: abEntry?.Type === 'Company' ? abKey : undefined,
    contact_ids: person && abKey ? [abKey] : undefined,
    close_date: zonedIso(raw.CloseDate),
    created_at: zonedIso(raw.CreationDate),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Subject = data.title
  if (data.value?.amount !== undefined) out.Revenue = data.value.amount
  if (data.status !== undefined) out.SaleStage = data.status
  if (data.contact_ids?.[0] !== undefined) out.ContactKey = data.contact_ids[0]
  if (data.company_id !== undefined) out.CompanyKey = data.company_id
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  if (data.close_date !== undefined) out.CloseDate = data.close_date
  return out
}
