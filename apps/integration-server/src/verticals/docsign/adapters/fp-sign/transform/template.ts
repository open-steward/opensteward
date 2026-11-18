import type { Template } from '../../../schema/template'
import { pickStr, strMap } from './shared'

/**
 * FP Sign `WorkflowTemplateInfo` — returned by `/intents/workflowtemplates`.
 * The list endpoint surfaces only id + name; richer template detail is not
 * exposed by the public API.
 */
export interface RawFpSignTemplate {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawFpSignTemplate): Template {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    signerRoles: [],
    documentCount: 0,
    platform: 'fp-sign',
    metadata: strMap({}),
    raw,
  }
}
