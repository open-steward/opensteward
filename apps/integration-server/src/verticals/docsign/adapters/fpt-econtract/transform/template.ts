import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A FPT.eContract contract template (mẫu hợp đồng). Templates define the
 * reusable document set and the recipient roles to be filled in when a
 * contract is created from them.
 */
export interface RawFptEcontractTemplate {
  id: string | number
  code?: string
  name?: string
  title?: string
  description?: string
  note?: string
  status?: string
  roles?: Array<{ name?: string; roleName?: string } | string>
  recipients?: Array<{ role?: string; roleName?: string }>
  documents?: Array<{ id?: string | number }>
  documentCount?: string | number
  numberOfDocuments?: string | number
  createdAt?: string
  createdDate?: string
  updatedAt?: string
  modifiedDate?: string
  [key: string]: unknown
}

function signerRoles(raw: RawFptEcontractTemplate): string[] {
  const fromRoles = (raw.roles ?? [])
    .map((r) => (typeof r === 'string' ? r : (r.roleName ?? r.name)))
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
  if (fromRoles.length > 0) return fromRoles
  return (raw.recipients ?? [])
    .map((r) => r.roleName ?? r.role)
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
}

function documentCount(raw: RawFptEcontractTemplate): number {
  if (Array.isArray(raw.documents)) return raw.documents.length
  return pickNum(raw.documentCount ?? raw.numberOfDocuments) ?? 0
}

export function transformTemplate(raw: RawFptEcontractTemplate): Template {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name ?? raw.title ?? raw.code) ?? '',
    description: pickStr(raw.description ?? raw.note),
    signerRoles: signerRoles(raw),
    documentCount: documentCount(raw),
    createdAt: toIso(raw.createdAt ?? raw.createdDate),
    updatedAt: toIso(raw.updatedAt ?? raw.modifiedDate),
    platform: 'fpt-econtract',
    metadata: strMap({ code: raw.code, status: raw.status }),
    raw,
  }
}
