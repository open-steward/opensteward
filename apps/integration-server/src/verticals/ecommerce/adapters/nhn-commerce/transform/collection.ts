/**
 * NHN Commerce (Shopby) Category → canonical Collection.
 *
 * Shopby organises its catalogue into categories (카테고리) exposed at:
 *   GET /categories          → all categories (multi-level tree + flat list)
 *   GET /categories/{no}     → single category
 *
 * The API returns a tree of `multiLevelCategories` and a flat list of
 * `flatCategories`. We map each unique category node to a Collection.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnCategory {
  categoryNo: number | string
  label: string
  depth?: number
  icon?: string | null
  content?: string | null
  displayOrder?: number
  children?: RawNhnCategory[]
  [key: string]: unknown
}

export interface RawNhnCategoryResponse {
  multiLevelCategories?: RawNhnCategory[]
  flatCategories?: Record<string, unknown>[]
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

function imageFromUrl(url: string | null | undefined): Image | undefined {
  if (!url) return undefined
  const src = url.startsWith('//') ? `https:${url}` : url
  return { url: src }
}

export function transformCategory(raw: RawNhnCategory): Collection {
  return {
    id: String(raw.categoryNo),
    title: raw.label,
    description: raw.content ?? undefined,
    type: 'MANUAL',
    image: imageFromUrl(raw.icon),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Flatten a multi-level category tree into a flat list of Collections.
 * All depths are included.
 */
export function flattenCategories(categories: RawNhnCategory[]): Collection[] {
  const result: Collection[] = []
  function walk(nodes: RawNhnCategory[]) {
    for (const node of nodes) {
      result.push(transformCategory(node))
      if (node.children && node.children.length > 0) {
        walk(node.children)
      }
    }
  }
  walk(categories)
  return result
}
