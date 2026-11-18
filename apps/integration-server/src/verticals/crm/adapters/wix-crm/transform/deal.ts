import type { Deal } from '../../../schema/deal'

/** Wix CRM v3 has no native deal/opportunity resource. This transform is a stub. */
export function transformDeal(_raw: unknown): Deal {
  throw new Error('not implemented')
}
