import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * An Icertis template entity record. Templates drive agreement creation;
 * ICI exposes the contract type, the configured signatory roles, and the
 * count of associated documents.
 */
export interface RawIcertisTemplate {
  ICMId: string
  Id?: string
  Name?: string
  DisplayName?: string
  Description?: string
  ContractType?: string
  SignatoryRoles?: string[]
  Roles?: string[]
  AssociatedDocumentCount?: number
  DocumentCount?: number
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawIcertisTemplate): Template {
  return {
    id: raw.ICMId,
    externalId: raw.ICMId,
    name: pickStr(raw.Name) ?? pickStr(raw.DisplayName) ?? '',
    description: pickStr(raw.Description),
    signerRoles: raw.SignatoryRoles ?? raw.Roles ?? [],
    documentCount: pickNum(raw.AssociatedDocumentCount) ?? pickNum(raw.DocumentCount) ?? 1,
    createdAt: toIso(raw.CreatedOn),
    updatedAt: toIso(raw.ModifiedOn),
    platform: 'icertis',
    metadata: strMap({ contractType: raw.ContractType }),
    raw,
  }
}
