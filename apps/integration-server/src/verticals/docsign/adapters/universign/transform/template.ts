/**
 * Universign template → canonical Template.
 *
 * Fields per "The Template object" (https://apps.universign.com/docs/api/),
 * as returned by GET /v1/templates/{template_id} and in each `content` row of
 * GET /v1/templates.
 */
import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'
import type { RawUniversignTemplate } from './types'

/**
 * The template's signer roles: each distinct `instructions.signatures[ ].signer`
 * ("The signer's email address or designtation (in case the participant is
 * unknown)"). The examples show an unknown participant's temporary ID there
 * (`$1720534563486`); that participant's `designation` ("The designation of
 * the unknown participant", e.g. `Employee`) is the role name, when it has one.
 */
function signerRoles(raw: RawUniversignTemplate): string[] {
  const designation = new Map<string, string>()
  for (const p of raw.participants ?? []) {
    const d = pickStr(p.designation)
    if (d !== undefined) designation.set(p.email, d)
  }
  const out: string[] = []
  for (const s of raw.instructions?.signatures ?? []) {
    const role = designation.get(s.signer) ?? s.signer
    if (!out.includes(role)) out.push(role)
  }
  return out
}

export function transformTemplate(raw: RawUniversignTemplate): Template {
  const name = pickStr(raw.template_name)
  if (name === undefined) {
    throw new Error(`Universign template ${raw.id} has no template_name`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    name,
    signerRoles: signerRoles(raw),
    documentCount: (raw.documents ?? []).length,
    createdAt: toIso(raw.created_at),
    platform: 'universign',
    metadata: strMap({
      ...raw.metadata,
      state: raw.state,
      folderId: raw.folder_id,
      language: raw.language,
      lastPublicationDate: raw.last_publication_date,
    }),
    raw,
  }
}
