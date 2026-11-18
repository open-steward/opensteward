import { Iso4217Currency } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

/**
 * `Opportunity_GET` / `Opportunity_GetByID` from
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (GET /api/v1/opportunities, GET /api/v1/opportunities/{id}). Only documented fields.
 */
export interface RawEfficyDeal {
  crm_id?: string
  external_id?: string
  name?: string
  /** "The estimated or allocated budget for the opportunity, represented as a numeric value." */
  budget?: number
  /** e.g. { external_id: 'EUR', crm_id: '…', name: 'Euro' } */
  currency?: { crm_id?: string; external_id?: string; name?: string }
  customer?: { crm_id?: string; external_id?: string; name?: string }
  customer_contacts?: Array<{ crm_id?: string; external_id?: string }>
  responsible?: { crm_id?: string; code?: string; name?: string }
  /** "Status of the opportunity", e.g. `03Offer`; creation enum: won, 22Lost, 01Prospect, 02Approach, 03Offer, 05Negotiation, WON_SYNCED. */
  status?: string
  /** "The likelihood of successfully closing the opportunity, expressed as a percentage" */
  success_probability?: number
  closing_date?: string
  creation_date?: string
  last_update_date?: string
  [key: string]: unknown
}

/** Budget in the opportunity's own currency, or nothing when either half is absent. */
function value(raw: RawEfficyDeal): Deal['value'] {
  const code = raw.currency?.external_id
  if (typeof raw.budget !== 'number' || raw.budget < 0) return undefined
  if (!code || !Iso4217Currency.safeParse(code).success) return undefined
  return { amount: raw.budget, currency: code }
}

export function transformDeal(raw: RawEfficyDeal): Deal {
  if (!raw.crm_id) throw new Error('Efficy opportunity has no crm_id')
  if (!raw.name) throw new Error(`Efficy opportunity ${raw.crm_id} has no name`)
  const contactIds = (raw.customer_contacts ?? [])
    .map((c) => c.crm_id)
    .filter((id): id is string => typeof id === 'string' && id !== '')
  return {
    id: raw.crm_id,
    title: raw.name,
    value: value(raw),
    status: raw.status || undefined,
    company_id: raw.customer?.crm_id || undefined,
    contact_ids: contactIds.length > 0 ? contactIds : undefined,
    owner_id: raw.responsible?.crm_id || undefined,
    close_date: raw.closing_date,
    probability: typeof raw.success_probability === 'number' ? raw.success_probability : undefined,
    created_at: raw.creation_date,
    updated_at: raw.last_update_date,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.NAME = data.title
  if (data.value?.amount !== undefined) out.AMOUNT = data.value.amount
  if (data.value?.currency !== undefined) out.CURRENCY = data.value.currency
  if (data.status !== undefined) out.STATUS = data.status
  if (data.stage_id !== undefined) out.K_PIPELINE_STEP = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.K_PIPELINE = Number(data.pipeline_id)
  if (data.company_id !== undefined) out.K_COMPANY = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.K_CONTACT = Number(data.contact_ids[0])
  if (data.close_date !== undefined) out.CLOSEDATE = data.close_date
  return out
}
