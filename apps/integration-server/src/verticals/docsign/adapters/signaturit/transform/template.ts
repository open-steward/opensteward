/**
 * Signaturit template → canonical Template.
 *
 * The documented Template object has `id`, `name` and `created_at`, and
 * defines the resource as "a prepared document that can be sent
 * repeatedly": one document. No roles are documented on it.
 */
import type { Template } from '../../../schema/template'
import { requireStr, toIso } from './shared'

export interface RawSignaturitTemplate {
  id: string
  name?: string
  created_at?: string
}

export function transformTemplate(raw: RawSignaturitTemplate): Template {
  const id = requireStr(raw.id, 'template id')
  return {
    id,
    externalId: id,
    name: requireStr(raw.name, `name of template ${id}`),
    signerRoles: [],
    documentCount: 1,
    createdAt: toIso(raw.created_at),
    platform: 'signaturit',
    metadata: {},
    raw,
  }
}
