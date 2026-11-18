import type { Template } from '../../../schema/template'
import { ownerMemberId, pickStr, strMap, toIso, type RawSproofDocument } from './shared'
import { memberRole } from './signer'

/**
 * A template is a `_Document` listed by GET /documents?view=templates (`view`
 * enum value "templates"). Keyed, like an envelope, by the owner's member id,
 * which GET /documents/{memberId} reads back. One `_Document` is one file, so
 * `documentCount` is 1. Roles are the documented member flags, each once.
 */
export function transformTemplate(raw: RawSproofDocument): Template {
  const id = ownerMemberId(raw)
  const roles: string[] = []
  for (const m of raw.members ?? []) {
    const role = memberRole(m)
    if (role !== 'unknown' && !roles.includes(role)) roles.push(role)
  }
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    signerRoles: roles,
    documentCount: 1,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'sproof-sign',
    metadata: strMap({ documentId: raw.id, refId: raw.refId }),
    raw,
  }
}
