import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawFoxitESignTemplate {
  id?: string
  templateId?: string
  name?: string
  templateName?: string
  description?: string
  createdAt?: string
  createdDate?: string
  updatedAt?: string
  modifiedDate?: string
  recipients?: Array<{ role?: string; roleName?: string }>
  documents?: Array<unknown>
  documentCount?: number | string
  pageCount?: number | string
  shared?: boolean | string
  emailSubject?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawFoxitESignTemplate): Template {
  const id = pickStr(raw.id) ?? pickStr(raw.templateId) ?? ''
  const documentCount =
    pickNum(raw.documentCount) ??
    (Array.isArray(raw.documents) ? raw.documents.length : (pickNum(raw.pageCount) ?? 0))
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? pickStr(raw.templateName) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.recipients ?? [])
      .map((r) => pickStr(r.role ?? r.roleName))
      .filter((r): r is string => Boolean(r)),
    documentCount,
    createdAt: toIso(raw.createdAt ?? raw.createdDate),
    updatedAt: toIso(raw.updatedAt ?? raw.modifiedDate),
    platform: 'foxit-esign',
    metadata: strMap({ shared: raw.shared, emailSubject: raw.emailSubject }),
    raw,
  }
}
