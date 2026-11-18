import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawAdobeSignLibraryDocument {
  id: string
  name?: string
  modifiedDate?: string
  scope?: string
  templateTypes?: string[]
  ownerEmail?: string
  description?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawAdobeSignLibraryDocument): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    // Adobe Sign library documents don't enumerate signer roles on the list
    // endpoint; the per-template detail endpoint can be called to expand.
    signerRoles: [],
    documentCount: 1,
    updatedAt: toIso(raw.modifiedDate),
    platform: 'adobe-acrobat-sign',
    metadata: strMap({
      scope: raw.scope,
      templateTypes: raw.templateTypes?.join(','),
      ownerEmail: raw.ownerEmail,
    }),
    raw,
  }
}
