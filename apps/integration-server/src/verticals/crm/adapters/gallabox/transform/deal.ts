/**
 * Gallabox does not have a native Deal resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 *
 * Docs: https://developers.gallabox.com/
 */
import type { Deal } from '../../../schema/deal'

export interface RawGallaboxDeal {
  id: string | number
  title?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawGallaboxDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
