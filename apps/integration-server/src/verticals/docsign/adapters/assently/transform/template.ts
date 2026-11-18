import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'
import type { RawAssentlyCase } from './envelope'

/**
 * Assently templates are reusable cases (addressed via `templateId`); the
 * template list/detail endpoints return the same CaseModel shape, so the
 * transform reuses `RawAssentlyCase`. Role names are the party group names.
 */
export function transformTemplate(raw: RawAssentlyCase): Template {
  const id = pickStr(raw.templateId) ?? pickStr(raw.caseId) ?? pickStr(raw.id) ?? ''
  const signerRoles = (raw.parties ?? [])
    .map((p) => pickStr(p.groupName))
    .filter((r): r is string => Boolean(r))
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? pickStr(raw.nameAlias) ?? '',
    signerRoles,
    documentCount: Array.isArray(raw.documents) ? raw.documents.length : 0,
    createdAt: toIso(raw.createdOn),
    platform: 'assently',
    metadata: {
      ...strMap(raw.metadata),
      ...(raw.culture ? { culture: raw.culture } : {}),
    },
    raw,
  }
}
