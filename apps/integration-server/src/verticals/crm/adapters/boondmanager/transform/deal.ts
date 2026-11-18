/**
 * BoondManager opportunity ↔ canonical Deal transform.
 *
 * In BoondManager the "deal" equivalent is an "opportunity" (`/opportunities`).
 *
 * Key attributes:
 *   name, state, startDate, endDate, note
 * Relationships:
 *   company (company_id), contact (contact_ids), mainManager (owner_id)
 */

import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'
import type { JsonApiItem } from '../client'

export interface RawBoondManagerOpportunity extends JsonApiItem {
  attributes: {
    name?: string
    state?: number
    startDate?: string
    endDate?: string
    note?: string
    creationDate?: string
    updateDate?: string
    [key: string]: unknown
  }
  relationships?: {
    company?: { data?: { id?: string; type?: string } | null }
    contact?: { data?: { id?: string; type?: string } | null }
    mainManager?: { data?: { id?: string; type?: string } | null }
    [key: string]: unknown
  }
}

export function transformDeal(raw: RawBoondManagerOpportunity): Deal {
  const a = raw.attributes ?? {}
  const rels = raw.relationships ?? {}

  const companyId =
    (rels.company as { data?: { id?: string } | null } | undefined)?.data?.id
  const contactId =
    (rels.contact as { data?: { id?: string } | null } | undefined)?.data?.id
  const ownerId =
    (rels.mainManager as { data?: { id?: string } | null } | undefined)?.data?.id

  // BoondManager state is a numeric dict ID — expose as string stage
  const stateNum = a.state as number | undefined
  const stateStr = stateNum !== undefined ? String(stateNum) : undefined

  return {
    id: String(raw.id),
    title: (a.name as string | undefined) ?? '',
    stage: stateStr,
    company_id: companyId ?? undefined,
    contact_ids: contactId ? [contactId] : undefined,
    owner_id: ownerId ?? undefined,
    close_date: toIsoDatetime(a.endDate),
    created_at: toIsoDatetime(a.creationDate),
    updated_at: toIsoDatetime(a.updateDate),
    metadata: { id: raw.id, type: raw.type, ...a, relationships: rels },
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['name'] = data.title
  if (data.stage !== undefined) out['state'] = Number(data.stage)
  return out
}
