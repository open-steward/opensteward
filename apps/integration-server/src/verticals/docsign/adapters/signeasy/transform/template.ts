import type { Template } from '../../../schema/template'
import { epochSecondsToIso, pickStr, requireId, requireStr, strMap } from './shared'

/**
 * A template as documented by "Fetch all templates" (GET /template) and
 * "Fetch a template" (GET /template/{template_id}).
 * https://docs.signeasy.com/reference/list-templates.md
 */
export interface RawSignEasyTemplate {
  id?: number
  name?: string
  created_time?: number
  modified_time?: number
  is_ordered?: boolean
  is_owned?: boolean
  is_public?: boolean
  is_shared?: boolean
  metadata?: { roles?: Array<{ name?: string; [key: string]: unknown }>; [key: string]: unknown }
  [key: string]: unknown
}

export function transformTemplate(raw: RawSignEasyTemplate): Template {
  const id = requireId(raw.id, 'template')
  return {
    id,
    externalId: id,
    name: requireStr(raw.name, 'template name'),
    signerRoles: (raw.metadata?.roles ?? [])
      .map((r) => pickStr(r.name))
      .filter((n): n is string => Boolean(n)),
    // "Upload a document to Signeasy and set it up as a template. A template is
    // how you can send out multiple signature requests based on a single
    // document" (https://docs.signeasy.com/reference/upload-a-template.md).
    documentCount: 1,
    createdAt: epochSecondsToIso(raw.created_time),
    updatedAt: epochSecondsToIso(raw.modified_time),
    platform: 'signeasy',
    metadata: strMap({
      isOrdered: raw.is_ordered,
      isOwned: raw.is_owned,
      isPublic: raw.is_public,
      isShared: raw.is_shared,
    }),
    raw,
  }
}
