/**
 * Annature template → canonical Template.
 *
 * Fields per "The Template object"
 * (https://docs.annature.com.au/api-reference/templates/template-object.md):
 * `id`, `name`, `shared`, `envelope_name`, `envelope_message`,
 * `envelope_shared`, `created`, `account_id`, `group_id`, `documents` ("An
 * array of document objects defined within the template"), `roles` ("An array
 * of role objects representing placeholder recipients"), each role carrying
 * `id`, `name`, `recipient_*` defaults (List all templates example).
 *
 * No description or update time is documented; both are omitted. The raw
 * copy drops the documents' download links and each role's
 * `recipient_password`.
 */
import type { Template } from '../../../schema/template'
import type { RawAnnatureDocument } from './document'
import { strMap, toIso } from './shared'

export interface RawAnnatureTemplateRole {
  id: string
  name: string
  recipient_name?: string | null
  recipient_email?: string | null
  recipient_mobile?: string | null
  recipient_type?: string | null
  recipient_password?: string | null
  recipient_order?: number | null
  recipient_redirects?: Record<string, unknown> | null
}

export interface RawAnnatureTemplate {
  id: string
  name: string
  shared?: boolean
  envelope_name?: string | null
  envelope_message?: string | null
  envelope_shared?: boolean
  created?: string | null
  account_id?: string | null
  group_id?: string | null
  documents: RawAnnatureDocument[]
  roles: RawAnnatureTemplateRole[]
}

function sanitize(raw: RawAnnatureTemplate): Record<string, unknown> {
  return {
    ...raw,
    documents: raw.documents.map(({ original: _o, master: _m, ...d }) => d),
    roles: raw.roles.map(({ recipient_password: _p, ...r }) => r),
  }
}

export function transformTemplate(raw: RawAnnatureTemplate): Template {
  // "templates must include at least one document and one role": both arrays
  // belong to every template, so a response without them is refused rather
  // than read as an empty template.
  if (!Array.isArray(raw.documents) || !Array.isArray(raw.roles)) {
    throw new Error(`annature template ${raw.id} came back without its documents or roles array`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    signerRoles: raw.roles.map((r) => r.name),
    documentCount: raw.documents.length,
    createdAt: toIso(raw.created),
    platform: 'annature',
    metadata: strMap({
      envelopeName: raw.envelope_name,
      accountId: raw.account_id,
      groupId: raw.group_id,
    }),
    raw: sanitize(raw),
  }
}
