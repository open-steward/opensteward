/**
 * Drupal Taxonomy Term → canonical Collection.
 *
 * Drupal Commerce does not have a first-class "collection" entity. Product
 * groupings are modelled as Drupal core taxonomy terms attached to products
 * via an entity-reference field. The vocabulary machine name is site-specific;
 * the conventional bundle is `product_categories`, but sites may use any name.
 *
 * JSON:API path: `/jsonapi/taxonomy_term/{vocabulary}` (e.g.
 * `/jsonapi/taxonomy_term/product_categories`).
 *
 * `taxonomy_term--{vocabulary}` attributes (Drupal core):
 *   - `name`          — term label (required)
 *   - `description`   — `{value, format}` object (optional)
 *   - `weight`        — integer sort weight
 *   - `changed`       — Unix timestamp of last modification
 *   - `path`          — `{alias}` URL alias object (optional)
 *
 * Relationships:
 *   - `parent`        — parent taxonomy terms (hierarchical)
 *   - `vid`           — the vocabulary this term belongs to
 */

import type { Collection } from '../../../schema/collection'
import type { JsonApiResource } from '../client'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalTermDescription {
  value?: string | null
  format?: string | null
}

export interface DrupalTermPath {
  alias?: string | null
  langcode?: string | null
}

export interface DrupalTermAttributes {
  name?: string
  description?: DrupalTermDescription | null
  weight?: number
  changed?: number | string | null
  published_at?: number | string | null
  path?: DrupalTermPath | null
  [key: string]: unknown
}

export type DrupalTaxonomyTerm = JsonApiResource & {
  attributes: DrupalTermAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: DrupalTaxonomyTerm): Collection {
  const attrs = raw.attributes
  const name = attrs.name ?? ''
  const handle =
    (attrs.path?.alias ? attrs.path.alias.replace(/^\//, '') : null) ??
    (name ? slugify(name) : undefined)

  const descriptionValue =
    typeof attrs.description === 'object' && attrs.description !== null
      ? (attrs.description.value ?? undefined)
      : undefined

  return {
    id: raw.id,
    title: name,
    handle,
    description: descriptionValue ?? undefined,
    // Drupal taxonomy has no native MANUAL/SMART distinction — terms are manual
    type: 'MANUAL',
    updatedAt: unixToIso(attrs.changed),
    publishedAt: unixToIso(attrs.published_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
