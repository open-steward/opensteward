import type { Deal } from '../../../schema/deal'
import type { NetHuntRecord } from '../types'

/**
 * A record of the folder whose `role` is `deal` → canonical Deal.
 *
 * Deal.title is required and its only documented source is the record's
 * `name` key ("The `name` key sets the record display name"); a record with
 * no name is refused rather than given an invented title. Amount, currency,
 * stage and status are custom fields with workspace-specific ids and no
 * documented role binding, so they are not mapped (and no money is guessed):
 * they stay in `metadata.fields`.
 */
export function transformDeal(raw: NetHuntRecord): Deal {
  const name = raw.fields['name']
  if (typeof name !== 'string' || name === '') {
    throw new Error(`NetHunt CRM deal record ${raw.id} has no name`)
  }
  return {
    id: raw.id,
    title: name,
    created_at: raw.createdISO,
    updated_at: raw.updatedISO,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['name'] = data.title
  if (data.status !== undefined) out['status'] = data.status
  if (data.stage !== undefined) out['stage'] = data.stage
  if (data.value?.amount !== undefined) out['amount'] = data.value.amount
  if (data.close_date !== undefined) out['close_date'] = data.close_date
  if (data.contact_ids?.[0] !== undefined) out['contact_id'] = data.contact_ids[0]
  if (data.company_id !== undefined) out['company_id'] = data.company_id
  return out
}
