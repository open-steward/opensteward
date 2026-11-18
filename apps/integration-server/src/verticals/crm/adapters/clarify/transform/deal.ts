/**
 * Clarify "deal" object type.
 *
 * Attributes: name, amount, stage, close_date, company_id,
 *   contact_ids (array), owner_id, status, pipeline_id, created_at, updated_at
 */

import type { Deal } from '../../../schema/deal'

export interface RawClarifyDealAttributes {
  name?: string
  amount?: number | string
  stage?: string
  close_date?: string
  company_id?: string
  contact_ids?: string[]
  owner_id?: string
  status?: string
  pipeline_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawClarifyDeal {
  id: string
  type?: string
  attributes: RawClarifyDealAttributes
  [key: string]: unknown
}

export function transformDeal(raw: RawClarifyDeal): Deal {
  const a = raw.attributes
  const amountRaw = a.amount
  const amount =
    amountRaw != null
      ? typeof amountRaw === 'number'
        ? amountRaw
        : parseFloat(String(amountRaw))
      : undefined

  return {
    id: String(raw.id),
    title: a.name ?? '',
    value:
      amount != null && !isNaN(amount)
        ? { amount, currency: 'USD' }
        : undefined,
    stage: a.stage ?? undefined,
    status: a.status ?? undefined,
    pipeline_id: a.pipeline_id ?? undefined,
    company_id: a.company_id ?? undefined,
    contact_ids: a.contact_ids && a.contact_ids.length > 0 ? a.contact_ids : undefined,
    owner_id: a.owner_id ?? undefined,
    close_date: a.close_date ?? undefined,
    created_at: a.created_at ?? undefined,
    updated_at: a.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.title !== undefined) attributes.name = data.title
  if (data.value?.amount !== undefined) attributes.amount = data.value.amount
  if (data.stage !== undefined) attributes.stage = data.stage
  if (data.close_date !== undefined) attributes.close_date = data.close_date
  if (data.company_id !== undefined) attributes.company_id = data.company_id
  if (data.contact_ids !== undefined) attributes.contact_ids = data.contact_ids
  if (data.owner_id !== undefined) attributes.owner_id = data.owner_id
  if (data.status !== undefined) attributes.status = data.status
  if (data.pipeline_id !== undefined) attributes.pipeline_id = data.pipeline_id
  return {
    data: {
      type: 'deal',
      attributes,
    },
  }
}
