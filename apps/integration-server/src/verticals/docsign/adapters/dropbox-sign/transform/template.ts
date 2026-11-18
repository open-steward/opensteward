import type { Template } from '../../../schema/template'
import { epochToIso, pickStr, strMap } from './shared'

export interface RawDropboxSignTemplate {
  template_id: string
  title?: string
  message?: string
  signer_roles?: Array<{ name: string; order?: number }>
  cc_roles?: Array<{ name: string }>
  documents?: Array<{ name?: string; index?: number }>
  custom_fields?: Array<{ name?: string }>
  is_creator?: boolean
  is_locked?: boolean
  updated_at?: number
  created_at?: number
  [key: string]: unknown
}

export function transformTemplate(raw: RawDropboxSignTemplate): Template {
  return {
    id: raw.template_id,
    externalId: raw.template_id,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.message),
    signerRoles: (raw.signer_roles ?? []).map((r) => r.name),
    documentCount: (raw.documents ?? []).length,
    createdAt: epochToIso(raw.created_at),
    updatedAt: epochToIso(raw.updated_at),
    platform: 'dropbox-sign',
    metadata: strMap({ isCreator: raw.is_creator, isLocked: raw.is_locked }),
    raw,
  }
}
