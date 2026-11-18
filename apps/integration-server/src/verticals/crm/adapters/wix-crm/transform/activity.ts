import type { Activity } from '../../../schema/activity'

/** Wix CRM has no standard activity resource. This transform is a stub. */
export function transformActivity(_raw: unknown): Activity {
  throw new Error('not implemented')
}
