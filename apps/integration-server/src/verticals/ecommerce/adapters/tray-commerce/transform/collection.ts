/**
 * Tray Category → canonical Collection.
 *
 * Verified with curl against developers.tray.com.br (see `client.ts`
 * header for why curl, not WebFetch, was needed to see this content).
 *
 *   - GET (`#consultar-arvore-de-categorias-get`):
 *     `GET /categories/tree/:id?access_token=`. Response example:
 *     `{"Category": [{"Category": {slug, id, parent_id, name, description,
 *     title, small_description, link:{http,https}, images:[{http,https}],
 *     has_product, children: [{"Category": {...same shape...}}] | null}}]}`
 *     — `children` is a CONFIRMED key, wrapping each child exactly like the
 *     top level (`{"Category": {...}}`), recursively.
 *   - `:id` is documented as required ("Código da categoria"), and no
 *     example demonstrates fetching the whole tree in one call. `0` is used
 *     here as the root id — a common convention for this style of
 *     CakePHP-tree API, matching the top category's own `"parent_id": ""`
 *     (blank = root) in the response example — but this specific value was
 *     not itself demonstrated in a curl example, unlike everything else in
 *     this file. Confirm against a live store during homologação.
 *   - CREATE (`#cadastrar-categoria-post`): `POST /categories/?access_token=`,
 *     bracket-form body: name, description, slug, title, small_description,
 *     has_acceptance_term, acceptance_term, metatag{keywords,description},
 *     property[]. Adding `parent_id` creates a subcategory (documented in
 *     the same section's closing note). The docs explicitly say `order` is
 *     no longer accepted on this endpoint ("O parâmetro order não pode ser
 *     mais enviado nessa requisição"), so it is not sent here.
 *   - No update or delete endpoint appears anywhere in the docs' own table
 *     of contents for categories, so neither is implemented.
 */
import type { Collection } from '../../../schema/collection'

export interface RawTrayCategoryLink {
  http?: string
  https?: string
}

export interface RawTrayCategory {
  id: number | string
  parent_id?: number | string | null
  name: string
  description?: string
  slug?: string
  title?: string
  small_description?: string
  link?: RawTrayCategoryLink
  has_product?: number | string
  /** Each entry is `{"Category": {...}}`, same shape as the top level, or `null`/absent for a leaf. */
  children?: Array<{ Category: RawTrayCategory }> | null
  [key: string]: unknown
}

/** Flatten the confirmed `{"Category": {..., children: [{"Category": {...}}]}}` tree into a flat list. */
export function flattenCategories(nodes: RawTrayCategory[]): RawTrayCategory[] {
  const out: RawTrayCategory[] = []
  for (const node of nodes) {
    out.push(node)
    if (node.children) {
      out.push(...flattenCategories(node.children.map((c) => c.Category)))
    }
  }
  return out
}

export function transformCollection(raw: RawTrayCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Tray category body (bracket-form POST `/categories`, wrapped as `Category` by the caller). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    description: collection.description,
    slug: collection.handle,
  }
  const parentId = (collection.metadata as { parent_id?: unknown } | undefined)?.parent_id
  if (parentId != null && parentId !== '') body.parent_id = parentId
  return body
}
