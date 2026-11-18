/**
 * GoDaddy catalog List → canonical Collection.
 *
 * "A list is a group of SKU groups that are generally organized by similar
 * characteristics." — `List` on
 * https://developer.godaddy.com/docs/references/rest/catalog/list/queries/list
 *
 * The docs never say "collection"; a List (a named group of SKU groups, i.e.
 * of canonical products) is the catalog's only such grouping. Its membership
 * is edited with `addSkuGroupsToList`, but the docs do not call lists manual
 * or rule-based, so the canonical `type` is left unset.
 */

import { toIsoDatetime, toSlug } from '@opensteward/shared'
import type { Collection } from '../../../schema/collection'

/** The `List` fields `LIST_FIELDS` selects. */
export interface RawGoDaddyList {
  /** "The globally-unique ID of the List." */
  id: string
  /** "A unique name for the List. Must be lowercase alphanumeric characters, and may include `-` or `_`" */
  name: string
  /** "The display label of the List." */
  label?: string | null
  /** "A single-line textual description of the List." */
  description?: string | null
  /** "The status of the list, one of `ACTIVE`, `DRAFT`, `ARCHIVED`." */
  status?: string | null
  createdAt: string
  updatedAt: string
}

/** GraphQL selection for a `List`, kept beside the type it fills. */
export const LIST_FIELDS = 'id name label description status createdAt updatedAt'

export function transformList(raw: RawGoDaddyList): Collection {
  const handle = toSlug(raw.name)
  const updatedAt = toIsoDatetime(raw.updatedAt)
  return {
    id: raw.id,
    title: raw.label ?? raw.name,
    ...(handle ? { handle } : {}),
    ...(raw.description ? { description: raw.description } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
