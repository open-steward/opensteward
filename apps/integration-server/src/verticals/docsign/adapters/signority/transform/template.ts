import type { Template } from '../../../schema/template'
import type { RawSignorityDocument } from './envelope'
import { pickStr, strMap, toIso } from './shared'

export type { RawSignorityDocument } from './envelope'

/**
 * Signority templates are documents whose `documentType` is one of the
 * template variants (6 Template Link, 7 Regular Template, 8 Bulk Template),
 * so they share the document shape. The recipient `invitations` define the
 * template's signer roles.
 */
export function transformTemplate(raw: RawSignorityDocument): Template {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.title) ?? '',
    signerRoles: (raw.invitations ?? [])
      .map((i) => pickStr(i.recipientName))
      .filter((r): r is string => typeof r === 'string'),
    documentCount: Array.isArray(raw.files) ? raw.files.length : 0,
    createdAt: toIso(raw.createdTime),
    updatedAt: toIso(raw.lastModifiedTime),
    platform: 'signority',
    metadata: strMap({
      GUID: raw.GUID,
      documentType: raw.documentType,
    }),
    raw,
  }
}
