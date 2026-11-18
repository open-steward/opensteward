import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCrispMacro {
  id: number
  title?: string
  description?: string | null
  actions?: Array<{ field?: string; value?: string }>
  [key: string]: unknown
}

function extractBody(raw: RawCrispMacro): string {
  // Zendesk macros store body in actions[].value where field === 'comment_value'
  const bodyAction = (raw.actions ?? []).find((a) => a.field === 'comment_value')
  return pickStr(bodyAction?.value) ?? ''
}

export function transformMacro(raw: RawCrispMacro): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.title) ?? '',
    body: extractBody(raw),
    category: pickStr(raw.description),
    platform: 'crisp',
    metadata: strMap({}),
    raw,
  }
}
