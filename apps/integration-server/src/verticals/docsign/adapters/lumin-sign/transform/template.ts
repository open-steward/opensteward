import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Lumin template — shape is shared between the list item (template_id, type,
 * name, created_at, updated_at) and the detail response (which additionally
 * carries signing_type, signer_roles, tags, fields). All fields beyond the
 * list set are optional so a single transform handles both responses.
 */
export interface RawLuminSignTemplate {
  template_id: string
  type?: string
  name?: string
  signing_type?: string
  signer_roles?: Array<{ name?: string; group?: number }>
  tags?: Array<{ name?: string; type?: string; is_required?: boolean }>
  fields?: Array<{ name?: string; type?: string; is_required?: boolean; assigned_role?: string }>
  created_at?: string | number
  updated_at?: string | number
  [key: string]: unknown
}

export function transformTemplate(raw: RawLuminSignTemplate): Template {
  return {
    id: raw.template_id,
    externalId: raw.template_id,
    name: pickStr(raw.name) ?? '',
    signerRoles: (raw.signer_roles ?? [])
      .map((r) => r.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0),
    // Lumin templates expose no document-count field; the role/field sets are
    // metadata-level only. Default to 0 (templates are one logical document).
    documentCount: 0,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'lumin-sign',
    metadata: strMap({
      type: raw.type,
      signingType: raw.signing_type,
      fieldCount: raw.fields?.length,
      tagCount: raw.tags?.length,
    }),
    raw,
  }
}
