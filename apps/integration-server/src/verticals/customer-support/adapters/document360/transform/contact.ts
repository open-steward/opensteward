/**
 * Maps a Document360 Reader to the canonical Contact shape.
 *
 * Readers are portal users (customers/end-users) who consume the
 * knowledge-base. They are the closest equivalent to "contacts" in a
 * customer-support context.
 *
 * Docs: https://apidocs.document360.com/apidocs/get-readers
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawDocument360Reader {
  reader_id: string
  first_name?: string
  last_name?: string
  /** Primary email address of the reader */
  email?: string
  /** Most recent login timestamp (ISO-8601) */
  last_login_at?: string
  is_invite_sso_user?: boolean
  access_scope?: {
    access_level?: string
    [key: string]: unknown
  }
  associated_reader_groups?: string[]
  [key: string]: unknown
}

function buildName(raw: RawDocument360Reader): string {
  const parts = [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : ''
}

export function transformContact(raw: RawDocument360Reader): Contact {
  return {
    id: String(raw.reader_id),
    externalId: String(raw.reader_id),
    email: pickStr(raw.email),
    name: buildName(raw),
    phone: undefined,
    organizationId: undefined,
    platform: 'document360',
    metadata: strMap({
      accessLevel: raw.access_scope?.access_level,
      isSsoUser: raw.is_invite_sso_user,
    }),
    raw,
  }
}
