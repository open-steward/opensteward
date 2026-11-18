import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpCrunchMacro {
  id: number
  title?: string
  description?: string | null
  actions?: Array<{ field?: string; value?: string }>
  [key: string]: unknown
}

function extractBody(raw: RawHelpCrunchMacro): string {
  // Zendesk macros store body in actions[].value where field === 'comment_value'
  const bodyAction = (raw.actions ?? []).find((a) => a.field === 'comment_value')
  return pickStr(bodyAction?.value) ?? ''
}

export function transformMacro(raw: RawHelpCrunchMacro): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.title) ?? '',
    body: extractBody(raw),
    category: pickStr(raw.description),
    platform: 'helpcrunch',
    metadata: strMap({}),
    raw,
  }
}
