import type { Deal } from '../../../schema/deal'
import type { PodioItem } from '../client'
import { getFieldValue, getCategoryText, getRelationId, buildFields } from './helpers'
import { DEAL_FIELDS } from '../constants'

export function transformDeal(raw: PodioItem): Deal {
  const f = raw.fields
  const title = getFieldValue(f, DEAL_FIELDS.TITLE) ?? `Deal ${raw.item_id}`
  const valueStr = getFieldValue(f, DEAL_FIELDS.VALUE)
  const amount = valueStr !== undefined ? parseFloat(valueStr) : undefined
  return {
    id: String(raw.item_id),
    title,
    value: amount != null && !isNaN(amount) ? { amount, currency: 'USD' } : undefined,
    stage_id: getCategoryText(f, DEAL_FIELDS.STAGE),
    contact_ids: getRelationId(f, DEAL_FIELDS.CONTACT) !== undefined
      ? [getRelationId(f, DEAL_FIELDS.CONTACT) as string]
      : undefined,
    company_id: getRelationId(f, DEAL_FIELDS.COMPANY),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const pairs: Array<[string, Array<Record<string, unknown>>]> = []
  if (data.title !== undefined)
    pairs.push([DEAL_FIELDS.TITLE, [{ value: data.title }]])
  if (data.value?.amount !== undefined)
    pairs.push([DEAL_FIELDS.VALUE, [{ value: data.value.amount }]])
  return { fields: buildFields(pairs) }
}
