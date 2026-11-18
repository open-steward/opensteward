/**
 * lemlist Note transform.
 *
 * lemlist surfaces notes only as company-scoped records.
 * Endpoint: GET /companies/{companyId}/notes
 *           POST /companies/{companyId}/notes
 *
 * Response shape:
 *   _id, teamId, companyId, note, type, userId, sendUserId, createdAt, updatedAt
 *
 * Docs: https://developer.lemlist.com/api-reference/endpoints/companies/get-company-notes
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawLemlistNote {
  _id: string
  teamId?: string
  companyId?: string
  note?: string
  type?: string
  userId?: string
  sendUserId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawLemlistNote): Note {
  return {
    id: String(raw._id),
    content: raw.note ?? '',
    company_id: raw.companyId ? String(raw.companyId) : undefined,
    owner_id: raw.userId ? String(raw.userId) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
