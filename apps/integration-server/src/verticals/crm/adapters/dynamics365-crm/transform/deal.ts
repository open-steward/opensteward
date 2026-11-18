import type { Deal } from '../../../schema/deal'

export interface RawDynamicsOpportunity {
  opportunityid: string
  name: string
  estimatedvalue?: number | null
  closedateestimated?: string | null
  actualclosedate?: string | null
  salesstagecode?: number | string | null
  _parentaccountid_value?: string | null
  _parentcontactid_value?: string | null
  _ownerid_value?: string | null
  closeprobability?: number | null
  createdon?: string | null
  modifiedon?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawDynamicsOpportunity): Deal {
  return {
    id: String(raw.opportunityid),
    title: raw.name,
    value: raw.estimatedvalue != null
      ? { amount: raw.estimatedvalue, currency: 'USD' }
      : undefined,
    stage_id: raw.salesstagecode != null ? String(raw.salesstagecode) : undefined,
    close_date: raw.actualclosedate ?? raw.closedateestimated ?? undefined,
    company_id: raw._parentaccountid_value ?? undefined,
    contact_ids: raw._parentcontactid_value ? [raw._parentcontactid_value] : undefined,
    owner_id: raw._ownerid_value ?? undefined,
    probability: raw.closeprobability ?? undefined,
    created_at: raw.createdon ?? undefined,
    updated_at: raw.modifiedon ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.estimatedvalue = data.value.amount
  if (data.stage_id !== undefined) out.salesstagecode = data.stage_id
  if (data.close_date !== undefined) out.actualclosedate = data.close_date
  if (data.company_id !== undefined) {
    out['parentaccountid@odata.bind'] = `/accounts(${data.company_id})`
  }
  if (data.probability !== undefined) out.closeprobability = data.probability
  return out
}
