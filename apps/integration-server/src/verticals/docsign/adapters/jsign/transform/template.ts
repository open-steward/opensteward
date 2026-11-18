import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Shape returned by GET /api/v2/templates/list items and
 * GET /api/v2/templates/{templateId}/details.
 *
 * jSign uses snake_case field names.
 */
export interface RawJsignTemplate {
  id?: string
  template_id?: string
  name?: string
  description?: string
  created_at?: string
  updated_at?: string
  categories?: string[]
  /** Recipients block from template details */
  recipients?: {
    signers?: Array<{ signer_title?: string }>
    observers?: Array<{ observer_title?: string }>
  }
  /** Documents block from template details */
  documents?: Array<{ id?: string; name?: string }>
  [key: string]: unknown
}

export function transformTemplate(raw: RawJsignTemplate): Template {
  const id = pickStr(raw.id ?? raw.template_id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.recipients?.signers ?? [])
      .map((s) => s.signer_title)
      .filter((r): r is string => typeof r === 'string' && r.length > 0),
    documentCount: Array.isArray(raw.documents)
      ? raw.documents.length
      : (pickNum(raw.documents) ?? 0),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'jsign',
    metadata: strMap({
      categories: Array.isArray(raw.categories) ? raw.categories.join(',') : undefined,
    }),
    raw,
  }
}
