/**
 * Transform between canonical CRM Note and CAS genesisWorld Todo objects
 * (object type: todo).
 *
 * Todos in genesisWorld are free-form task/note records attached to addresses
 * or other objects. The Note field carries the text body.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawCasTodo {
  /** GGUID — primary identifier */
  GWGUID?: string
  /** Note / description body */
  Note?: string
  /** Short subject / title (stored in metadata) */
  Subject?: string
  /** Owning user GGUID */
  UserGGUID?: string
  /** Linked contact address GGUID */
  ContactGGUID?: string
  /** Linked company address GGUID */
  CompanyGGUID?: string
  /** Creation timestamp (ISO 8601) */
  CreateDate?: string
  /** Last-modification timestamp (ISO 8601) */
  UpdateDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawCasTodo): Note {
  return {
    id: String(raw.GWGUID ?? ''),
    content: raw.Note ?? raw.Subject ?? '',
    contact_id: raw.ContactGGUID ? String(raw.ContactGGUID) : undefined,
    company_id: raw.CompanyGGUID ? String(raw.CompanyGGUID) : undefined,
    owner_id: raw.UserGGUID ? String(raw.UserGGUID) : undefined,
    created_at: toIsoDatetime(raw.CreateDate),
    updated_at: toIsoDatetime(raw.UpdateDate),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Note = data.content
  if (data.owner_id !== undefined) out.UserGGUID = data.owner_id
  if (data.contact_id !== undefined) out.ContactGGUID = data.contact_id
  if (data.company_id !== undefined) out.CompanyGGUID = data.company_id
  return out
}
