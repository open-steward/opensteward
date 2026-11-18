/**
 * Transforms a Knowmax Category into the canonical Team shape.
 *
 * Knowmax category response shape:
 * {
 *   id: number,
 *   name: string,
 *   description: string | null,
 *   parent_id: number | null,
 *   articles_count: number,
 *   created_at: string,
 *   updated_at: string,
 *   [key: string]: unknown
 * }
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKnowmaxCategory {
  id: number | string
  name?: string
  description?: string | null
  parent_id?: number | string | null
  articles_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCategory(raw: RawKnowmaxCategory): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'chatbot-knowmax',
    metadata: strMap({
      description: raw.description,
      parentId: raw.parent_id,
      articlesCount: raw.articles_count,
    }),
    raw,
  }
}
