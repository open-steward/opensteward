/**
 * Intercom macro (saved reply) → canonical Macro. Fields: the `macro` schema
 * of the 2.16 OpenAPI description. `body_text` is "The plain text version of
 * the macro body with original Intercom placeholder format"; `body` is the
 * HTML form, used only when there is no plain text.
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { Macro } from '../../../schema'
import { fromIso, pickStr, strMap } from './shared'

export interface RawIntercomMacro {
  type?: string
  id: string | number
  name?: string | null
  body?: string | null
  body_text?: string | null
  created_at?: string | null
  updated_at?: string | null
  /** enum: everyone, specific_teams */
  visible_to?: string | null
  visible_to_team_ids?: string[] | null
  available_on?: string[] | null
  [key: string]: unknown
}

export function transformMacro(raw: RawIntercomMacro): Macro {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    title: pickStr(raw.name) ?? '',
    body: pickStr(raw.body_text) ?? pickStr(raw.body) ?? '',
    platform: 'intercom',
    metadata: strMap({
      visibleTo: raw.visible_to,
      availableOn: Array.isArray(raw.available_on) ? raw.available_on.join(',') : undefined,
      createdAt: fromIso(raw.created_at),
      updatedAt: fromIso(raw.updated_at),
    }),
    raw,
  }
}
