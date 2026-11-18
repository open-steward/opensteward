/**
 * Nutshell does not have a dedicated Notes API.
 * This file is a placeholder — all note methods return 501 (not implemented).
 */

import type { Note } from '../../../schema/note'

 
export function transformNote(_raw: Record<string, unknown>): Note {
  throw new Error('Nutshell: Notes API is not supported')
}

 
export function untransformNote(_data: Partial<Note>): Record<string, unknown> {
  throw new Error('Nutshell: Notes API is not supported')
}
