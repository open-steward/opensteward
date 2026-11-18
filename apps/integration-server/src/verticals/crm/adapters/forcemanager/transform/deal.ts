import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { refId, requireId, text, type ValueRef } from '../refs'

/**
 * ForceManager Opportunity, as documented by GET /opportunities and
 * GET /opportunities/{ID} (https://developer.forcemanager.com/openapi.json,
 * "List of the supported Opportunities attributes"). Only the attributes this
 * transform reads are typed.
 */
export interface RawForceManagerOpportunity {
  id?: number | string | null
  reference?: string | null
  total?: number | null
  currencyId?: ValueRef | null
  statusId?: ValueRef | null
  type_id?: ValueRef | null
  accountId1?: ValueRef | null
  salesRepId?: ValueRef | null
  closedDate?: string | null
  dateCreated?: string | null
  dateUpdated?: string | null
  [key: string]: unknown
}

/**
 * `currencyIso` is the ISO 4217 code of the opportunity's `currencyId`, looked
 * up in GET /currencies ("isoCode | String | The ISO 4217 code of the
 * Currency"). `currencyId.value` is only a name ("euro"), so without the
 * lookup the value is omitted rather than given a guessed currency.
 */
export function transformDeal(raw: RawForceManagerOpportunity, currencyIso?: string): Deal {
  const total =
    typeof raw.total === 'number' && Number.isFinite(raw.total) && raw.total >= 0
      ? raw.total
      : undefined
  return {
    id: requireId(raw, 'opportunity'),
    // "reference | String | Opportunity's name"
    title: raw.reference ?? '',
    value:
      total !== undefined && currencyIso ? { amount: total, currency: currencyIso } : undefined,
    // statusId is the Opportunity Status (a pipeline stage), e.g. { "id": 434, "value": "Won" }.
    stage: text(raw.statusId?.value),
    stage_id: refId(raw.statusId),
    // type_id is the Opportunity Type; Types are the pipelines (see listPipelines).
    pipeline_id: refId(raw.type_id),
    // "accountId1 | Object, Null | First Account to whom the Opportunity is linked to"
    company_id: refId(raw.accountId1),
    owner_id: refId(raw.salesRepId),
    // probability is not mapped: salesProbability's scale is contradictory in
    // the docs ("it is a number between 0 and 10" in the POST/PUT tables,
    // "Object, Null" in the GET table, and 60 in the PUT example), so neither
    // a pass-through nor a x10 scaling is backed by them.
    // "closedDate | String | Date when the Opportunity was closed"
    close_date: toIsoDatetime(raw.closedDate),
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateUpdated),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.totalValue = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
