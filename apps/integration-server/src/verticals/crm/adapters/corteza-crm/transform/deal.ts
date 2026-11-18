/**
 * Deal (Opportunity) transform for Corteza CRM.
 *
 * Field names are those of the `Opportunity` module in Corteza's CRM
 * application (corteza-server provision/700_crm/1100_modules.yaml): Name,
 * AccountId (Record), OwnerId (User), StageName (Select: Qualification, Need
 * Analysis, Proposal, Negotiation, Closed Won, Closed Lost), CloseDate
 * (DateTime), Probability (Number, "Probability (%)", precision 0), IsClosed
 * and IsWon (Bool).
 *
 * Bool values are "1" for true and "0" or empty for false
 * (server/compose/service/values/shared.go: strBoolTrue = "1").
 *
 * The module has an `Amount` Number but no currency field, so no canonical
 * `value` is emitted. Contacts link to opportunities through the separate
 * OpportunityContactRole module, so `contact_ids` is not set here.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import type { CortezaRecord, CortezaFieldValue } from '../client'

/**
 * A record value by field name. Corteza omits `value` when it is empty
 * (record_value.go: `Value string json:"value,omitempty"`), so absent and ''
 * both read as undefined.
 */
function field(record: CortezaRecord, name: string): string | undefined {
  const found = record.values?.find((v) => v.name === name)
  return found?.value !== undefined && found.value !== '' ? found.value : undefined
}

export { CortezaRecord as RawCortezaOpportunity }

export function transformDeal(raw: CortezaRecord): Deal {
  const probabilityRaw = field(raw, 'Probability')
  const probability = probabilityRaw != null ? Number(probabilityRaw) : undefined

  let status: string
  if (field(raw, 'IsClosed') === '1') {
    status = field(raw, 'IsWon') === '1' ? 'won' : 'lost'
  } else {
    status = 'open'
  }

  const stageName = field(raw, 'StageName')

  return {
    id: String(raw.recordID),
    // An empty value is omitted by Corteza, so absent is the empty name.
    title: field(raw, 'Name') ?? '',
    status,
    stage: stageName,
    stage_id: stageName,
    company_id: field(raw, 'AccountId'),
    owner_id: field(raw, 'OwnerId'),
    probability:
      probability != null && Number.isFinite(probability) && probability >= 0 && probability <= 100
        ? probability
        : undefined,
    close_date: toIsoDatetime(field(raw, 'CloseDate')),
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): CortezaFieldValue[] {
  const values: CortezaFieldValue[] = []
  if (data.title !== undefined) values.push({ name: 'Name', value: data.title })
  if (data.company_id !== undefined) values.push({ name: 'AccountId', value: data.company_id })
  if (data.owner_id !== undefined) values.push({ name: 'OwnerId', value: data.owner_id })
  const stageName = data.stage_id ?? data.stage
  if (stageName !== undefined) values.push({ name: 'StageName', value: stageName })
  if (data.close_date !== undefined) values.push({ name: 'CloseDate', value: data.close_date })
  if (data.probability !== undefined)
    values.push({ name: 'Probability', value: String(data.probability) })
  if (data.contact_ids?.[0] !== undefined)
    values.push({ name: 'ContactId', value: data.contact_ids[0] })
  if (data.status !== undefined) {
    const isClosed = data.status === 'won' || data.status === 'lost'
    values.push({ name: 'IsClosed', value: isClosed ? 'true' : 'false' })
    if (isClosed) {
      values.push({ name: 'IsWon', value: data.status === 'won' ? 'true' : 'false' })
    }
  }
  return values
}
