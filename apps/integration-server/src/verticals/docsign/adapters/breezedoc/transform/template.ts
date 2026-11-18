import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'
import type { RawBreezedocDocument } from './envelope'

/**
 * BreezeDoc templates share the document shape and are flagged
 * `is_template: true`. Their recipients are role placeholders rather than
 * real signers, so we surface recipient names as `signerRoles`.
 */
export type RawBreezedocTemplate = RawBreezedocDocument

export function transformTemplate(raw: RawBreezedocTemplate): Template {
  const externalId = String(raw.id)
  return {
    id: externalId,
    externalId,
    name: pickStr(raw.title) ?? '',
    signerRoles: (raw.recipients ?? [])
      .map((r) => pickStr(r.name))
      .filter((n): n is string => typeof n === 'string'),
    documentCount: (raw.document_files ?? []).length,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'breezedoc',
    metadata: strMap({ slug: raw.slug, isTemplate: raw.is_template }),
    raw,
  }
}
