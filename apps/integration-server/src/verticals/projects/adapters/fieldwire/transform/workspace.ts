/**
 * Fieldwire account → canonical Workspace transform.
 *
 * In Fieldwire's data model, the "account" is the top-level workspace
 * container. Account fields surfaced on the JWT response and project objects:
 *   id (int32), name (string), plan_name (string)
 *
 * The account endpoint returns basic account metadata.
 *
 * Docs: https://developers.fieldwire.com/docs/getting-started
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFieldwireAccount {
  id: number | string
  name?: string | null
  plan_name?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawFieldwireAccount): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'fieldwire',
    metadata: strMap({ planName: raw.plan_name }),
    raw,
  }
}
