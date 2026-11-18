/**
 * Flowmono does not expose a templates API endpoint in its current public
 * REST API (confirmed from https://api.flowmono.com/swagger/v1/swagger.json).
 *
 * This stub file keeps the import graph intact. The adapter does not
 * implement `listTemplates` / `getTemplate`; callers receive a 501 from
 * the vertical router.
 */
import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Placeholder raw type — not returned by any live endpoint.
 * Retained so that index.ts can reference the type without a compiler error.
 */
export interface RawFlowmonoTemplate {
  id?: string
  name?: string
  description?: string
  createdDate?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawFlowmonoTemplate): Template {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: [],
    documentCount: 0,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.lastModifiedDate),
    platform: 'flowmono',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
