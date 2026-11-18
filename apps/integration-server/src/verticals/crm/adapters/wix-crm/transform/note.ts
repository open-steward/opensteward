import type { Note } from '../../../schema/note'

/** Wix CRM has no standalone notes API. This transform is a stub. */
export function transformNote(_raw: unknown): Note {
  throw new Error('not implemented')
}
