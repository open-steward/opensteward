import type { Note } from '../../../schema/note'

export interface RawDynamicsAnnotation {
  annotationid: string
  subject?: string | null
  notetext?: string | null
  _objectid_value?: string | null
  objecttypecode?: string | null
  _ownerid_value?: string | null
  createdon?: string | null
  modifiedon?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawDynamicsAnnotation): Note {
  const isContact = raw.objecttypecode === 'contact'
  const isOpportunity = raw.objecttypecode === 'opportunity'

  return {
    id: String(raw.annotationid),
    content: raw.notetext ?? raw.subject ?? '',
    contact_id: isContact ? (raw._objectid_value ?? undefined) : undefined,
    deal_id: isOpportunity ? (raw._objectid_value ?? undefined) : undefined,
    owner_id: raw._ownerid_value ?? undefined,
    created_at: raw.createdon ?? undefined,
    updated_at: raw.modifiedon ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.notetext = data.content
  if (data.contact_id !== undefined) {
    out['objectid_contact@odata.bind'] = `/contacts(${data.contact_id})`
    out.objecttypecode = 'contact'
  }
  if (data.deal_id !== undefined) {
    out['objectid_opportunity@odata.bind'] = `/opportunities(${data.deal_id})`
    out.objecttypecode = 'opportunity'
  }
  if (data.owner_id !== undefined) {
    out['ownerid@odata.bind'] = `/systemusers(${data.owner_id})`
  }
  return out
}
