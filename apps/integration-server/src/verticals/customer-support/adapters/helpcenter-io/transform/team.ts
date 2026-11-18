/**
 * HelpCenter.io category → Team transform.
 *
 * Knowledge-base categories are the organizational grouping unit and map
 * naturally to Team in the customer-support schema.
 *
 * Category fields returned by GET /v1/categories:
 *   _id     — MongoDB ObjectId (primary key)
 *   name    — multilingual { en: "...", ... }
 *   description — multilingual, optional
 *   parent  — parent category _id, optional (for nested categories)
 *   icon    — optional string
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Category object returned by GET /v1/categories */
export interface RawHelpcenterCategory {
  _id?: string
  id?: string | number
  name?: Record<string, string> | string
  description?: Record<string, string> | string | null
  parent?: string | null
  icon?: string | null
  [key: string]: unknown
}

/** Pick from a multilingual field; prefer 'en', else first value. */
function pickLang(v: Record<string, string> | string | undefined | null): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (v['en']) return v['en']
  const first = Object.values(v).find((s) => s && s.length > 0)
  return first ?? undefined
}

function categoryId(raw: RawHelpcenterCategory): string {
  return pickStr(raw._id) ?? pickStr(raw.id) ?? ''
}

export function transformTeam(raw: RawHelpcenterCategory): Team {
  const id = categoryId(raw)
  const nameStr =
    raw.name && typeof raw.name === 'object'
      ? pickLang(raw.name) ?? ''
      : pickStr(raw.name as string) ?? ''
  const descStr =
    raw.description && typeof raw.description === 'object'
      ? pickLang(raw.description as Record<string, string>)
      : pickStr(raw.description as string)

  return {
    id,
    externalId: id,
    name: nameStr,
    platform: 'helpcenter-io',
    metadata: strMap({
      description: descStr,
      parent: raw.parent,
      icon: raw.icon,
    }),
    raw,
  }
}
