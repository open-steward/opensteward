import type { Note } from '../../../schema/note'
import { espoDatetimeToIso } from './datetime'
import { requireString } from './required'

// EspoCRM Note entity
export interface RawEspoCrmNote {
  id?: string
  post?: string
  type?: string
  parentType?: string
  parentId?: string
  relatedType?: string
  relatedId?: string
  createdById?: string
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawEspoCrmNote): Note {
  return {
    id: requireString(raw.id, 'Note.id'),
    content: (raw.post as string | undefined) ?? '',
    contact_id: raw.parentType === 'Contact' ? (raw.parentId as string) : undefined,
    company_id: raw.parentType === 'Account' ? (raw.parentId as string) : undefined,
    deal_id: raw.parentType === 'Opportunity' ? (raw.parentId as string) : undefined,
    owner_id: raw.createdById,
    created_at: espoDatetimeToIso(raw.createdAt),
    updated_at: espoDatetimeToIso(raw.modifiedAt),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.post = data.content
  if (data.contact_id !== undefined) {
    out.parentType = 'Contact'
    out.parentId = data.contact_id
  } else if (data.company_id !== undefined) {
    out.parentType = 'Account'
    out.parentId = data.company_id
  } else if (data.deal_id !== undefined) {
    out.parentType = 'Opportunity'
    out.parentId = data.deal_id
  }
  return out
}
