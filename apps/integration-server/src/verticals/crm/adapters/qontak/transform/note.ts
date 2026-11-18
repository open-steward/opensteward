import type { Note } from '../../../schema/note'
import { iso, ref, requireId } from '../fields'

/**
 * A note as GET /qontak/crm/notes and GET /qontak/crm/notes/{id} return it.
 * Only the fields this transform reads are typed; every key is from the
 * documented 200 example in Qontak's CRM OpenAPI
 * (https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json):
 * `"note": "<p>aaaaa</p>"`, `"creator_id": 1`, `"crm_person_id": 86`.
 */
export interface RawQontakNote {
  id: number | string
  note?: string | null
  creator_id?: number | string | null
  crm_person_id?: number | string | null
  crm_company_id?: number | string | null
  crm_deal_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawQontakNote): Note {
  if (typeof raw.note !== 'string') {
    throw new Error('Qontak note: record has no `note` text')
  }
  return {
    id: requireId(raw.id, 'note'),
    content: raw.note,
    contact_id: ref(raw.crm_person_id),
    company_id: ref(raw.crm_company_id),
    deal_id: ref(raw.crm_deal_id),
    owner_id: ref(raw.creator_id),
    created_at: iso(raw.created_at),
    updated_at: iso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
