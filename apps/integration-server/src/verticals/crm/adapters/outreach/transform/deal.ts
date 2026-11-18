import type { Deal } from '../../../schema/deal'
import type { JsonApiResource } from '../client'

export interface RawOutreachDealAttributes {
  name?: string
  amount?: number
  closeDate?: string
  stageName?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type RawOutreachDeal = JsonApiResource<RawOutreachDealAttributes>

export function transformDeal(raw: RawOutreachDeal): Deal {
  const attrs = raw.attributes

  const accountRel = raw.relationships?.['account']?.data
  const companyId = accountRel && !Array.isArray(accountRel)
    ? String(accountRel.id)
    : undefined

  const prospectsRel = raw.relationships?.['prospects']?.data
  const contactId = Array.isArray(prospectsRel) && prospectsRel.length > 0
    ? String(prospectsRel[0]!.id)
    : undefined

  const ownerRel = raw.relationships?.['owner']?.data
  const ownerId = ownerRel && !Array.isArray(ownerRel)
    ? String(ownerRel.id)
    : undefined

  return {
    id: String(raw.id),
    title: attrs.name ?? '',
    value: attrs.amount != null
      ? { amount: attrs.amount, currency: 'USD' }
      : undefined,
    close_date: attrs.closeDate,
    stage_id: attrs.stageName,
    company_id: companyId,
    contact_ids: contactId ? [contactId] : undefined,
    owner_id: ownerId,
    created_at: attrs.createdAt,
    updated_at: attrs.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  const relationships: Record<string, unknown> = {}

  if (data.title !== undefined) attributes['name'] = data.title
  if (data.value?.amount !== undefined) attributes['amount'] = data.value.amount
  if (data.close_date !== undefined) attributes['closeDate'] = data.close_date
  if (data.stage_id !== undefined) attributes['stageName'] = data.stage_id

  if (data.company_id !== undefined) {
    relationships['account'] = { data: { type: 'account', id: data.company_id } }
  }
  if (data.contact_ids?.[0] !== undefined) {
    relationships['prospects'] = { data: [{ type: 'prospect', id: data.contact_ids[0] }] }
  }
  if (data.owner_id !== undefined) {
    relationships['owner'] = { data: { type: 'user', id: data.owner_id } }
  }

  return {
    data: {
      type: 'opportunity',
      attributes,
      ...(Object.keys(relationships).length > 0 ? { relationships } : {}),
    },
  }
}
