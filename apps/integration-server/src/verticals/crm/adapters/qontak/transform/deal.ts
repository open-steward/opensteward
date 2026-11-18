import { Iso4217Currency } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import type { Money } from '../../../schema/shared'
import { iso, ref, requireId, requireText, text } from '../fields'

/**
 * A deal as GET /qontak/crm/deals and GET /qontak/crm/deals/{id} return it.
 * Only the fields this transform reads are typed; every key is from the
 * documented 200 example in Qontak's CRM OpenAPI
 * (https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json):
 * `"currency": "IDR"`, `"size": "10000000.0"`, `"crm_company_id": [1]`,
 * `"crm_lead_ids": [1]`.
 */
export interface RawQontakDeal {
  id: number | string
  name?: string | null
  currency?: string | null
  size?: string | number | null
  closed_date?: string | null
  crm_pipeline_id?: number | string | null
  crm_stage_id?: number | string | null
  crm_stage_name?: string | null
  crm_company_id?: Array<number | string> | null
  crm_lead_ids?: Array<number | string> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * `size` with its own `currency`, or nothing when either is missing or the
 * currency is not an ISO 4217 code (the documented value is `"IDR"`).
 */
function dealValue(raw: RawQontakDeal): Money | undefined {
  const currency = text(raw.currency)
  if (!currency || !Iso4217Currency.safeParse(currency).success) return undefined
  if (raw.size == null || raw.size === '') return undefined
  const amount = Number(raw.size)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return { amount, currency }
}

function ids(values: Array<number | string> | null | undefined): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const out = values.map(ref).filter((v): v is string => v !== undefined)
  return out.length > 0 ? out : undefined
}

export function transformDeal(raw: RawQontakDeal): Deal {
  return {
    id: requireId(raw.id, 'deal'),
    title: requireText(raw.name, 'deal', 'name'),
    value: dealValue(raw),
    stage: text(raw.crm_stage_name),
    stage_id: ref(raw.crm_stage_id),
    pipeline_id: ref(raw.crm_pipeline_id),
    contact_ids: ids(raw.crm_lead_ids),
    company_id: ids(raw.crm_company_id)?.[0],
    close_date: iso(raw.closed_date),
    created_at: iso(raw.created_at),
    updated_at: iso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
