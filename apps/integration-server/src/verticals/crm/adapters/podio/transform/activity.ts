import type { Activity } from '../../../schema/activity'

/**
 * Podio has no dedicated activity resource that maps cleanly to the canonical
 * Activity schema. This transform is a stub — the adapter returns 501 for
 * all activity methods.
 */
export function transformActivity(_raw: unknown): Activity {
  throw new Error('not implemented')
}
