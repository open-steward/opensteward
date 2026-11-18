import type { Deal } from '../../../schema/deal'
import { completeRefIds, entityId, refId, requiredString, str, type TeamworkRef } from '../raw'

/**
 * The Deal model of `GET /deals.json` (`deals[]`) and `GET /deals/{id}.json`
 * (`deal`), documented fields only
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/deals/get-dealsjson).
 *
 * `value` is not mapped. `totalValue` is documented only as "Total value of
 * the deal in your currency", with no unit, and `currency` is a relationship
 * id whose code needs a second, side-loaded model.
 */
export interface RawTeamworkDeal {
  id: number
  title: string
  /** "State of the deal." enum ["open","lost","won"] */
  state?: 'open' | 'lost' | 'won' | null
  stage?: TeamworkRef | null
  company?: TeamworkRef | null
  owner?: TeamworkRef | null
  contacts?: (TeamworkRef & { meta?: { isMain?: boolean } | null })[] | null
  contactsCount?: number | null
  expectedCloseDate?: string | null
  /** "Date the deal was closed (state: won/lost)." */
  closedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawTeamworkDeal): Deal {
  return {
    id: entityId(raw, 'deal'),
    title: requiredString(raw.title, 'title', 'deal'),
    status: str(raw.state),
    stage_id: refId(raw.stage),
    company_id: refId(raw.company),
    owner_id: refId(raw.owner),
    contact_ids: completeRefIds(raw.contacts, raw.contactsCount),
    close_date: raw.state === 'open' ? str(raw.expectedCloseDate) : str(raw.closedAt),
    created_at: str(raw.createdAt),
    updated_at: str(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
