/**
 * Misoca (Yayoi) organization transform.
 *
 * The /api/v3/user/me endpoint returns the authenticated user record.
 * Misoca does not expose a dedicated "company" resource; we map user/me
 * to Organization using email as the identifier.
 *
 * User fields:
 *   id, email
 *
 * Docs: https://doc.misoca.jp/v3/
 */

import type { Organization } from '../../../schema/organization'

export interface MisocaUser {
  id?: number
  email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MisocaUser): Organization {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.email || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
