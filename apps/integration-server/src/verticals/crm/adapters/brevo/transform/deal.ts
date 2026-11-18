import type { Deal } from '../../../schema/deal'

export interface RawBrevoDeal {
  id?: string
  attributes?: {
    deal_name?: string
    deal_stage?: string
    amount?: number
    currency?: string
    pipeline?: string
    close_date?: string
    deal_owner?: string
    [key: string]: unknown
  }
  // Links live at the top level of the deal object, not under `attributes`.
  // Contacts are Brevo's numeric contact ids; companies are Company.id strings.
  linkedContactsIds?: number[]
  linkedCompaniesIds?: string[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawBrevoDeal): Deal {
  const amount = raw.attributes?.amount
  const currency = raw.attributes?.currency as string | undefined
  return {
    id: String(raw.id ?? ''),
    title: raw.attributes?.deal_name ?? '',
    value: amount != null
      ? { amount, currency: currency ?? 'EUR' }
      : undefined,
    stage_id: raw.attributes?.deal_stage as string | undefined,
    pipeline_id: raw.attributes?.pipeline as string | undefined,
    company_id: raw.linkedCompaniesIds?.[0],
    contact_ids: raw.linkedContactsIds?.map((id) => String(id)),
    owner_id: raw.attributes?.deal_owner as string | undefined,
    close_date: raw.attributes?.close_date as string | undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const attrs: Record<string, unknown> = {}
  if (data.title !== undefined) attrs.deal_name = data.title
  if (data.value?.amount !== undefined) attrs.amount = data.value.amount
  if (data.value?.currency !== undefined) attrs.currency = data.value.currency
  if (data.stage_id !== undefined) attrs.deal_stage = data.stage_id
  if (data.pipeline_id !== undefined) attrs.pipeline = data.pipeline_id
  if (data.owner_id !== undefined) attrs.deal_owner = data.owner_id
  if (data.close_date !== undefined) attrs.close_date = data.close_date
  if (Object.keys(attrs).length > 0) out.attributes = attrs
  if (data.company_id !== undefined) out.linkedCompaniesIds = [data.company_id]
  if (data.contact_ids !== undefined) out.linkedContactsIds = data.contact_ids.map((id) => Number(id))
  return out
}
