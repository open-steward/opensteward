import type { Deal } from '../../../schema/deal'
import { samdockId } from './contact'

/**
 * Samdock's `Deal`, as GET /api/deals and GET /api/deals/{id} document it
 * (https://samdock.readme.io/reference/dealcontroller_browse.md).
 *
 * Mapped: `_id` and `name` only. Left in `metadata`:
 *  - `value` ("the value of the deal", a bare number): no currency is documented.
 *  - `stage` and `organization`: typed `object` with no documented properties.
 *  - `contactPerson`: a string whose examples are both a name ("John") and an id ("2").
 *  - `createdAt`/`updatedAt`: typed `number` with no documented unit.
 */
export interface RawSamdockDeal {
  /** "The ID of the deal" (required). */
  _id: string
  /** "The name of the deal" */
  name?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSamdockDeal): Deal {
  if (typeof raw.name !== 'string') throw new Error('Samdock deal has no name')
  return {
    id: samdockId(raw._id, 'deal'),
    title: raw.name,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) out.value = data.value?.amount
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
