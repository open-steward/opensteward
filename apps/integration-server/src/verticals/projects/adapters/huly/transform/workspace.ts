/**
 * The connection's Huly workspace → canonical Workspace.
 *
 * A Huly API token is bound to one workspace: "Your workspace ID (UUID) is
 * included in the token" (Settings → API Tokens), and the REST server refuses
 * any other (`if (workspaceId !== decodedToken.workspace) { sendError(res,
 * 403, ...`). The REST API documents no workspace document or name, so the
 * workspace is the connection's UUID, used as both id and name.
 */
import type { Workspace } from '../../../schema'

export function transformWorkspace(workspaceId: string): Workspace {
  return {
    id: workspaceId,
    externalId: workspaceId,
    name: workspaceId,
    platform: 'huly',
    metadata: {},
  }
}
