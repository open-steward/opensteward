/**
 * Artia adapter for the projects vertical.
 *
 * Artia is a Brazilian project-management platform that exposes a single
 * GraphQL endpoint at `https://api.artia.com/graphql`. Authentication is a
 * two-step client-credentials flow:
 *   1. The user supplies a Client ID, Secret, and Organisation ID (generated
 *      in Organisation Settings → Integrations → "Gerar chaves para API").
 *   2. `exchangeCredentials` calls the `authenticationByClient` mutation and
 *      caches the resulting Bearer token in `credentials.accessToken`.
 *      Tokens are valid for 1 hour; `refreshCredentials` re-mints them.
 *
 * Every subsequent request sends:
 *   Authorization: Bearer <token>
 *   OrganizationId: <organizationId>
 *
 * Canonical mapping (Artia hierarchy: Organisation → Folder → Activity → User):
 *   - Projects  ← Folders     listingFolders / showFolder
 *   - Tasks     ← Activities  listingActivities / showActivity
 *   - Users     ← Organisation users  listingOrganizationUsers / showOrganizationUser
 *
 * Deliberately unsupported (auto-501):
 *   - Comments   — Artia has no publicly documented comment/note GraphQL query.
 *   - Tags       — Artia has no freeform tag/label taxonomy in its public API.
 *   - Workspaces — The Organisation is the workspace; there is no enumerable
 *                  multi-workspace query in the public API.
 *
 * Webhooks: Artia does not document a signed inbound webhook mechanism for
 * registered connections, so webhook verification/parsing is NOT implemented.
 *
 * Pagination: Artia's public examples show no cursor/offset — all results are
 * returned in a single request. `DEFAULT_PAGE_SIZE` is kept for consistency
 * but is not sent as a GraphQL variable (the API does not accept it on list
 * queries).
 *
 * Rate limit: 100 req/min per IP; automatic 1-hour IP block on excess.
 *
 * Docs:    https://ajuda.artia.com/pt/articles/12559-api
 * Postman: https://documenter.getpostman.com/view/10208526/TVCZaWK4
 * GitHub:  https://github.com/Artia/api-examples
 */
import { pageLocally, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { User } from '../../schema/user'

import { CONNECT_FORM, buildAuthUrl, refreshCredentials as artiaRefresh } from './auth'
import { ArtiaClient } from './client'

import { transformProject, type RawArtiaFolder } from './transform/project'
import { transformTask, type RawArtiaActivity } from './transform/task'
import { transformUser, type RawArtiaOrganizationUser } from './transform/user'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: comment    — Artia has no publicly documented comment/note GraphQL query.
// Unavailable: tag        — Artia has no freeform tag/label taxonomy in its public API.
// Unavailable: workspace  — The Organisation is the workspace; there is no enumerable
//                           multi-workspace query in the public API.

// ── GraphQL query strings ───────────────────────────────────────────────────

const Q_LIST_FOLDERS = `
  query ListFolders($accountId: Int!) {
    listingFolders(accountId: $accountId) {
      id
      name
      description
      status
      createdAt
      updatedAt
      accountId
    }
  }
`

const Q_SHOW_FOLDER = `
  query ShowFolder($id: Int!, $accountId: Int!) {
    showFolder(id: $id, accountId: $accountId) {
      id
      name
      description
      status
      createdAt
      updatedAt
      accountId
    }
  }
`

const Q_LIST_ACTIVITIES = `
  query ListActivities($folderId: Int!, $accountId: Int!) {
    listingActivities(folderId: $folderId, accountId: $accountId) {
      id
      title
      description
      status
      customStatus {
        id
        statusName
        status
      }
      estimatedStart
      estimatedEnd
      createdAt
      updatedAt
      createdById
      communityId
      folderId
      accountId
      responsible {
        id
        name
        email
      }
      parent {
        id
        name
      }
    }
  }
`

const Q_SHOW_ACTIVITY = `
  query ShowActivity($id: Int!, $folderId: Int!, $accountId: Int!) {
    showActivity(id: $id, folderId: $folderId, accountId: $accountId) {
      id
      title
      description
      status
      customStatus {
        id
        statusName
        status
      }
      estimatedStart
      estimatedEnd
      createdAt
      updatedAt
      createdById
      communityId
      folderId
      accountId
      responsible {
        id
        name
        email
      }
      parent {
        id
        name
      }
    }
  }
`

// Users — documented in the Postman collection
// (https://documenter.getpostman.com/view/10208526/TVCZaWK4):
//   "Listar Usuários da Organização": "Lista todos os usuários da organização.
//   Não requer parâmetros." — no paging argument, so the whole organisation is
//   returned and paged locally.
//   "Buscar Usuário da Organização": "O campo user_id é obrigatório."
const Q_LIST_USERS = `
  query ListOrganizationUsers {
    listingOrganizationUsers {
      id
      userId
      name
      email
      role
      suspended
    }
  }
`

// The docs give user_id only as "Inteiro" and show it as a literal
// (`showOrganizationUser( userId: 1 )`); they never name its GraphQL type. So
// the id is validated as digits and inlined as that documented literal rather
// than declared as a variable of a guessed type (Int! vs ID!).
const showUserQuery = (userId: string): string => `
  query ShowOrganizationUser {
    showOrganizationUser(userId: ${userId}) {
      id
      userId
      name
      email
      role
      suspended
    }
  }
`

// ── GraphQL response envelopes ──────────────────────────────────────────────

interface ListFoldersData {
  listingFolders?: RawArtiaFolder[]
}

interface ShowFolderData {
  showFolder?: RawArtiaFolder
}

interface ListActivitiesData {
  listingActivities?: RawArtiaActivity[]
}

interface ShowActivityData {
  showActivity?: RawArtiaActivity
}

interface ListUsersData {
  listingOrganizationUsers?: RawArtiaOrganizationUser[] | null
}

interface ShowUserData {
  showOrganizationUser?: RawArtiaOrganizationUser | null
}

/** GraphQL reports failures in `errors` beside an HTTP 200. */
function throwOnGqlErrors(errors: Array<{ message: string }> | undefined, op: string): void {
  if (errors && errors.length > 0) {
    throw new Error(`Artia ${op} error: ${errors.map((e) => e.message).join('; ')}`)
  }
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class ArtiaAdapter implements ProjectsAdapter {
  readonly platform = 'artia'
  readonly version = '0.1.0'

  // Connect Link support — clientId + secret + organizationId form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // No OAuth authorization-code flow — Connect Link uses exchangeCredentials.
    // Treat the supplied code as the raw Bearer token for the BaseAdapter contract.
    return { accessToken: (code ?? '').trim() }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return artiaRefresh(credentials)
  }

  private client(credentials: Credentials): ArtiaClient {
    return new ArtiaClient(credentials)
  }

  /** Derive the numeric accountId from credentials.extra or a QueryParam. */
  private accountId(credentials: Credentials, params?: QueryParams): number {
    const fromParams = params?.['account_id'] ?? params?.['workspace_id']
    const fromExtra = credentials.extra?.['organizationId']
    const raw = fromParams ?? fromExtra ?? 0
    return Number(raw) || 0
  }

  // ── Projects (Folders) ──────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const accountId = this.accountId(credentials, params)
    const res = await this.client(credentials).query<ListFoldersData>(Q_LIST_FOLDERS, { accountId })
    return (res.data?.listingFolders ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const accountId = this.accountId(credentials)
    const res = await this.client(credentials).query<ShowFolderData>(Q_SHOW_FOLDER, {
      id: Number(id),
      accountId,
    })
    const folder = res.data?.showFolder
    if (!folder) throw new Error(`Artia folder ${id} not found`)
    return transformProject(folder)
  }

  // ── Tasks (Activities) ──────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const accountId = this.accountId(credentials, params)
    const res = await this.client(credentials).query<ListActivitiesData>(Q_LIST_ACTIVITIES, {
      folderId: Number(projectId),
      accountId,
    })
    return (res.data?.listingActivities ?? []).map((a) => transformTask(a, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const accountId = this.accountId(credentials)
    // folderId is required by the API; if not available we default to 0 and
    // let the API return an error for truly invalid requests.
    const folderId = Number(credentials.extra?.['folderId'] ?? 0)
    const res = await this.client(credentials).query<ShowActivityData>(Q_SHOW_ACTIVITY, {
      id: Number(id),
      folderId,
      accountId,
    })
    const activity = res.data?.showActivity
    if (!activity) throw new Error(`Artia activity ${id} not found`)
    return transformTask(activity)
  }

  // ── Users ───────────────────────────────────────────────────────────────

  /**
   * Every user of the connection's organisation (selected by the
   * `OrganizationId` header the client sends). `listingOrganizationUsers`
   * takes no arguments, so the whole list arrives in one response and is
   * paged locally.
   */
  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const organizationId = String(credentials.extra?.['organizationId'] ?? '')
    const res = await this.client(credentials).query<ListUsersData>(Q_LIST_USERS)
    throwOnGqlErrors(res.errors, 'listingOrganizationUsers')
    return pageLocally(res.data?.listingOrganizationUsers ?? [], params).map((u) =>
      transformUser(u, organizationId),
    )
  }

  /** `id` is the Artia `user_id`, the id `listUsers` returns. */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const organizationId = String(credentials.extra?.['organizationId'] ?? '')
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw Object.assign(new Error(`Artia user id must be an integer user_id (got "${id}")`), {
        statusCode: 400,
        code: 'VALIDATION',
      })
    }
    const res = await this.client(credentials).query<ShowUserData>(showUserQuery(id))
    throwOnGqlErrors(res.errors, 'showOrganizationUser')
    const user = res.data?.showOrganizationUser
    if (!user) throw new Error(`Artia user ${id} not found`)
    return transformUser(user, organizationId)
  }
}
