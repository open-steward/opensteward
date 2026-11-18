/**
 * Tiledesk canned-response (macro) transform.
 *
 * GET /v3/:project_id/canned
 * Response fields: _id, title, text (body), createdAt, updatedAt.
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTiledeskCannedResponse {
  _id?: string
  title?: string
  text?: string
  status?: number | null
  id_project?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawTiledeskCannedResponse): Macro {
  const id = pickStr(raw._id) ?? ''
  return {
    id,
    externalId: id,
    title: pickStr(raw.title) ?? '',
    body: pickStr(raw.text) ?? '',
    platform: 'tiledesk',
    metadata: strMap({
      createdAt: toIso(raw.createdAt),
    }),
    raw,
  }
}
