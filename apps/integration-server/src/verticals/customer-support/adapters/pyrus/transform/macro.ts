/**
 * Pyrus does not have a native macros/canned-responses concept.
 * This transform file is kept as a placeholder; listMacros is not implemented
 * in the PyrusAdapter (returns 501).
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPyrusMacro {
  id?: number | string
  title?: string
  body?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawPyrusMacro): Macro {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    title: pickStr(raw.title) ?? '',
    body: pickStr(raw.body) ?? '',
    category: undefined,
    platform: 'pyrus',
    metadata: strMap({}),
    raw,
  }
}
