import type { Template } from '../../../schema/template'
import type { RawCloudSignParticipant } from './signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * CloudSign has no dedicated template endpoint or template-shaped payload.
 * A "template" is a documentModel with status 4 (テンプレート — "template"),
 * returned by the same GET /documents (list) and GET /documents/{id} (get)
 * routes envelopes use. This is documentModel, not the old
 * (undocumented) /templates response shape.
 */
export interface RawCloudSignTemplate {
  id: string
  user_id?: string
  title?: string
  note?: string
  message?: string
  status?: number
  participants?: RawCloudSignParticipant[]
  files?: Array<{ id?: string; name?: string }>
  sent_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawCloudSignTemplate): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.note) ?? pickStr(raw.message),
    signerRoles: (raw.participants ?? [])
      .map((p) => pickStr(p.name) ?? pickStr(p.email))
      .filter((r): r is string => Boolean(r)),
    documentCount: raw.files?.length ?? 0,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'cloudsign',
    metadata: strMap({}),
    raw,
  }
}
