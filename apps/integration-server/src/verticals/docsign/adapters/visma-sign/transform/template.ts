import type { Template } from '../../../schema/template'
import { strMap } from './shared'

/**
 * One invitation template from `GET /api/v1/invitation-template`
 * (https://sign.visma.net/api/docs/v1/, "Get invitation templates"). Only the
 * fields read here are typed; the rest of the documented object (`content`,
 * `role_uuid`, `deleted_by`, …) rides along in `raw`.
 */
export interface RawVismaSignTemplate {
  uuid: string
  name: string
  organization_uuid?: string
  created_by?: string
  edited_by?: string
  /** "2020-02-07 19:47:04": no zone is given, so it is kept verbatim, never parsed. */
  edited_on?: string
  [key: string]: unknown
}

/**
 * An invitation template carries invitation settings only: a document and its
 * file are created separately ("Get invitation template and save the uuid.
 * Create document and save the document uuid. Add file to be signed. Create
 * invitations with invitation templates for the document."), so it holds no
 * documents and names no signer roles.
 */
export function transformTemplate(raw: RawVismaSignTemplate): Template {
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    name: raw.name,
    signerRoles: [],
    documentCount: 0,
    platform: 'visma-sign',
    metadata: strMap({ editedOn: raw.edited_on }),
    raw,
  }
}
