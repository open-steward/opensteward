/**
 * Transform Sprinklr Service macro → canonical Macro.
 *
 * Macros are fetched via GET /api/v1/bootstrap/resources?types=MACROS.
 * Key fields: id, name (title), description, macroType, messageTemplate
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSprinklrMacro {
  id?: string | number
  /** Display name of the macro */
  name?: string
  description?: string | null
  /** The canned message body / response template */
  messageTemplate?: string | null
  macroType?: string | null
  [key: string]: unknown
}

export function transformMacro(raw: RawSprinklrMacro): Macro {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    title: pickStr(raw.name) ?? '',
    body: pickStr(raw.messageTemplate) ?? pickStr(raw.description) ?? '',
    category: pickStr(raw.macroType),
    platform: 'sprinklr-service',
    metadata: strMap({}),
    raw,
  }
}
