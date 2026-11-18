import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A canonical Project maps to a Coda **doc** — the top-level container that
 * owns folders, pages, tables, and rows. `doc.workspace` / `doc.folder` are
 * reference objects; `owner` is the owner's login id (an email).
 */
export interface RawCodaWorkspaceReference {
  id: string
  type?: 'workspace'
  organizationId?: string
  browserLink?: string
  name?: string
  [key: string]: unknown
}

export interface RawCodaFolderReference {
  id: string
  type?: 'folder'
  browserLink?: string
  name?: string
}

export interface RawCodaDoc {
  id: string
  type?: 'doc'
  href?: string
  browserLink?: string
  icon?: { name?: string; type?: string; browserLink?: string }
  name?: string
  owner?: string
  ownerName?: string
  docSize?: { totalRowCount?: number; tableAndViewCount?: number; pageCount?: number }
  createdAt?: string
  updatedAt?: string
  published?: { browserLink?: string; discoverable?: boolean } | null
  folder?: RawCodaFolderReference
  workspace?: RawCodaWorkspaceReference
  workspaceId?: string
  folderId?: string
  [key: string]: unknown
}

/**
 * Coda docs have no lifecycle/status concept (no archive flag on the doc
 * object), so every doc is reported as `active` — there is no upstream signal
 * to distinguish on-hold/archived states.
 */
function mapStatus(_raw: RawCodaDoc): ProjectStatus {
  return 'active'
}

export function transformProject(raw: RawCodaDoc): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: raw.workspaceId ?? raw.workspace?.id ?? '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner),
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'coda',
    metadata: strMap({
      ownerName: raw.ownerName,
      folderId: raw.folderId ?? raw.folder?.id,
      folderName: raw.folder?.name,
      workspaceName: raw.workspace?.name,
      browserLink: raw.browserLink,
      pageCount: raw.docSize?.pageCount,
      tableAndViewCount: raw.docSize?.tableAndViewCount,
      totalRowCount: raw.docSize?.totalRowCount,
      published: raw.published ? 'true' : undefined,
    }),
    raw,
  }
}
