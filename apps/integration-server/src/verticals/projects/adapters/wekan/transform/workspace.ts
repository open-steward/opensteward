/**
 * Wekan virtual workspace → canonical Workspace.
 *
 * Wekan has no native workspace object. We synthesize a single workspace
 * record using the VIRTUAL_WORKSPACE_ID constant so the adapter satisfies
 * the listWorkspaces / getWorkspace contract.
 */
import type { Workspace } from '../../../schema'
import { strMap } from './shared'
import { VIRTUAL_WORKSPACE_ID } from '../constants'

export interface RawWekanVirtualWorkspace {
  _id: string
  name: string
  serverUrl?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawWekanVirtualWorkspace): Workspace {
  return {
    id: raw._id,
    externalId: raw._id,
    name: raw.name,
    platform: 'wekan',
    metadata: strMap({
      serverUrl: raw.serverUrl,
    }),
    raw,
  }
}

/** Build the synthetic workspace record from the server URL. */
export function buildVirtualWorkspace(serverUrl: string): RawWekanVirtualWorkspace {
  return {
    _id: VIRTUAL_WORKSPACE_ID,
    name: serverUrl || 'Wekan',
    serverUrl,
  }
}
