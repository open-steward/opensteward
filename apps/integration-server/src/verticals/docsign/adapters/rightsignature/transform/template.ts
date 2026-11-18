import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * RightSignature calls templates "reusable forms".
 */
export interface RawRightSignatureReusableForm {
  id?: string
  template_id?: string
  name?: string
  title?: string
  description?: string
  created_at?: string
  updated_at?: string
  roles?: Array<{ name?: string; role?: string }>
  signers?: Array<{ role?: string; name?: string }>
  document_count?: number | string
  page_count?: number | string
  pages?: number | string
  shared?: boolean | string
  [key: string]: unknown
}

export function transformTemplate(raw: RawRightSignatureReusableForm): Template {
  const id = pickStr(raw.id) ?? pickStr(raw.template_id) ?? ''
  const roles =
    (raw.roles ?? [])
      .map((r) => pickStr(r.name ?? r.role))
      .filter((r): r is string => Boolean(r))
  const fallbackRoles = (raw.signers ?? [])
    .map((s) => pickStr(s.role ?? s.name))
    .filter((r): r is string => Boolean(r))
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: roles.length > 0 ? roles : fallbackRoles,
    documentCount: pickNum(raw.document_count) ?? 1,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'rightsignature',
    metadata: strMap({ shared: raw.shared }),
    raw,
  }
}
