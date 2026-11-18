import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * `contracts_Template` — OpenSign's reusable template object, returned by
 * GET /template/:id and the template list endpoint. Signer roles come from
 * the embedded `Signers` (contactbook) array; the template carries a single
 * PDF document.
 */
export interface RawOpensignTemplate {
  objectId: string
  Name?: string
  Note?: string
  Description?: string
  URL?: string
  SignedUrl?: string
  SendinOrder?: boolean
  IsArchive?: boolean
  Signers?: Array<{ objectId?: string; Name?: string; Email?: string; Role?: string; UserRole?: string }>
  Placeholders?: Array<{ Role?: string; signerObjId?: string }>
  CreatedBy?: { objectId?: string }
  ExtUserPtr?: { objectId?: string; Name?: string; Email?: string }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function signerRoles(raw: RawOpensignTemplate): string[] {
  // Prefer placeholder roles (the named signing slots); fall back to signer
  // names so the canonical list is never empty when signers are attached.
  const placeholderRoles = (raw.Placeholders ?? [])
    .map((p) => pickStr(p.Role))
    .filter((r): r is string => typeof r === 'string')
  if (placeholderRoles.length > 0) return [...new Set(placeholderRoles)]
  return (raw.Signers ?? [])
    .map((s) => pickStr(s.Role) ?? pickStr(s.Name))
    .filter((r): r is string => typeof r === 'string')
}

export function transformTemplate(raw: RawOpensignTemplate): Template {
  return {
    id: raw.objectId,
    externalId: raw.objectId,
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description) ?? pickStr(raw.Note),
    signerRoles: signerRoles(raw),
    documentCount: raw.URL || raw.SignedUrl ? 1 : 0,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'opensign',
    metadata: strMap({
      sendinOrder: raw.SendinOrder,
      signerCount: (raw.Signers ?? []).length,
    }),
    raw,
  }
}
