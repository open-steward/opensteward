import type { Template } from '../../../schema/template'
import { idStr, pickStr, strMap, toIso } from './shared'

/**
 * A Documenso v1 template. The list endpoint omits templateMeta + document
 * data; the get-by-id endpoint includes them. Recipients are surfaced under
 * the `recipients` array (v1) / `Recipient` (raw Prisma relation), each with a
 * `role`. Numeric ids are coerced to strings.
 */
export interface RawDocumensoTemplate {
  id: number
  externalId?: string | null
  type?: string
  title?: string
  userId?: number
  teamId?: number | null
  createdAt?: string
  updatedAt?: string
  templateMeta?: {
    subject?: string | null
    message?: string | null
    redirectUrl?: string | null
    signingOrder?: string | null
  } | null
  recipients?: Array<{ role?: string; name?: string; email?: string }>
  Recipient?: Array<{ role?: string; name?: string; email?: string }>
  fields?: unknown[]
  Field?: unknown[]
  [key: string]: unknown
}

function recipientList(
  raw: RawDocumensoTemplate,
): Array<{ role?: string; name?: string }> {
  return raw.recipients ?? raw.Recipient ?? []
}

export function transformTemplate(raw: RawDocumensoTemplate): Template {
  const recipients = recipientList(raw)
  return {
    id: idStr(raw.id),
    externalId: raw.externalId ? String(raw.externalId) : idStr(raw.id),
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.templateMeta?.message),
    signerRoles: recipients
      .map((r) => r.role)
      .filter((r): r is string => typeof r === 'string'),
    documentCount: 1,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'documenso',
    metadata: strMap({
      type: raw.type,
      teamId: raw.teamId,
      subject: raw.templateMeta?.subject,
      signingOrder: raw.templateMeta?.signingOrder,
    }),
    raw,
  }
}
