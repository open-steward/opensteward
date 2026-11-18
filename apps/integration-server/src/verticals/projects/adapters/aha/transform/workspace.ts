/**
 * Aha! Product → canonical Workspace.
 *
 * A product is Aha!'s top-level container; releases (projects) and features
 * (tasks) hang off it. `reference_prefix` is the short code (e.g. "APP") that
 * prefixes every reference number in the product.
 *
 * Never throws — missing optionals resolve to `undefined`.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawAhaProduct {
  id: string
  reference_prefix?: string
  name?: string
  product_line?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawAhaProduct): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'aha',
    metadata: strMap({
      referencePrefix: raw.reference_prefix,
      productLine: raw.product_line,
    }),
    raw,
  }
}
