/**
 * ChurnZero deal transform stub.
 *
 * ChurnZero does not have a native "Deal" entity in its REST API.
 * The platform is focused on customer success (account health, churn risk)
 * rather than sales pipeline management.
 *
 * This stub is kept for structural consistency. The ChurnzeroAdapter does
 * NOT implement deal methods — the registry returns HTTP 501 automatically.
 */
import type { Deal } from '../../../schema/deal'

export interface RawChurnZeroDeal {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawChurnZeroDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    metadata: raw as Record<string, unknown>,
  }
}
