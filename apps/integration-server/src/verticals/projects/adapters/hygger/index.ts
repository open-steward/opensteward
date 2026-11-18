/**
 * Hygger adapter for the projects vertical.
 *
 * Every read method refuses (501 NOT_SUPPORTED) before sending anything.
 *
 * The first-party API reference is the API Blueprint behind
 * https://hygger.docs.apiary.io/ (raw: https://jsapi.apiary.io/apis/hygger.apib).
 * It documents `HOST: https://api.hygger.io/public-api/`, `Authorization: Bearer
 * <token>` and offset/limit lists such as
 *   "### List Boards [GET /boards{?expand,sort,offset,limit,project,closed}]"
 *   "### List Tasks [GET /tasks{?expand,sort,offset,limit,board,project,...}]"
 *   "### List Labels [GET /labels{?expand,sort,offset,limit,board,labels_ids,labels_id}]"
 *   "### List Users [GET /users{?expand,sort,offset,limit,board,deleted,confirmed,type}]"
 * The previous implementation called none of these: it sent `Authorization:
 * Token` to `https://api.hygger.io/v1` with page/per_page and nested paths
 * (/boards/{id}/cards, /cards/{id}/comments, /boards/{id}/labels, /workspaces,
 * /workspaces/{id}/members) that the reference does not contain.
 *
 * Boards, tasks, labels and users cannot be served either, because the live
 * host rejects every documented read (lists and get-by-id alike) for a
 * company id that the reference never mentions:
 *   "GET parameter company_id is required and must be abs int"
 * and this connection carries no company id (the credential is a single
 * token). The blueprint also documents no response body for any of these
 * operations, so there is no documented field to parse even with one.
 *
 * Comments and workspaces have no resource in the reference at all: comments
 * appear only as JSON-patch paths on PATCH /tasks/{id} ("path": "/comments/-"),
 * and the company operations are writes only ("### Create Companies [POST
 * /companies]", "### Change UsersCompanies [PATCH /users-companies/{id}]").
 * The nearest workspace analogue, "### List Projects [GET /projects{...}]",
 * documents no response body and gets the same company_id 422 live.
 *
 * No webhook API is documented; webhook methods are omitted.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HyggerAdapterConfig {}

/**
 * Why boards, tasks, labels and users are refused. The quoted text is the
 * live host's own 422 detail for every documented read sent without it.
 */
const NEEDS_COMPANY_ID =
  'the Hygger public API requires a company id on every read ("GET parameter company_id is required and must be abs int") and this connection has no company id'

/**
 * Why workspaces are refused. The reference has no workspace resource; its
 * only company operations are writes, and its nearest container of boards,
 * GET /projects, documents no response body and is rejected live with the
 * same company_id 422 as every other read.
 */
const NO_WORKSPACE =
  'the API reference documents no workspace resource: its company operations are writes only ("Create Companies [POST /companies]", "Change UsersCompanies [PATCH /users-companies/{id}]"), and its nearest container, "List Projects [GET /projects{?expand,sort,offset,limit,archived,closedBoards}]", documents no response body and is rejected live like every other read ("GET parameter company_id is required and must be abs int")'

function refuse(what: string, reason: string): never {
  throw Object.assign(new Error(`Hygger cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class HyggerAdapter implements ProjectsAdapter {
  readonly platform = 'hygger'
  readonly version = '0.1.0'

  constructor(_config: HyggerAdapterConfig = {}) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('hygger uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────

  async listWorkspaces(_credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    return refuse('list workspaces', NO_WORKSPACE)
  }

  async getWorkspace(_credentials: Credentials, _id: string): Promise<Workspace> {
    return refuse('read a workspace', NO_WORKSPACE)
  }

  // ── Projects (boards) ──────────────────────────────────────────────────────

  async listProjects(_credentials: Credentials, _params: QueryParams): Promise<Project[]> {
    return refuse('list boards', NEEDS_COMPANY_ID)
  }

  async getProject(_credentials: Credentials, _id: string): Promise<Project> {
    return refuse('read a board', NEEDS_COMPANY_ID)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    _credentials: Credentials,
    _projectId: string,
    _params: QueryParams,
  ): Promise<Task[]> {
    return refuse('list tasks', NEEDS_COMPANY_ID)
  }

  async getTask(_credentials: Credentials, _id: string): Promise<Task> {
    return refuse('read a task', NEEDS_COMPANY_ID)
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(
    _credentials: Credentials,
    _taskId: string,
    _params: QueryParams,
  ): Promise<Comment[]> {
    return refuse(
      'list comments',
      'the API reference documents no comments resource; comments appear only as JSON-patch paths ("/comments/-") on PATCH /tasks/{id}',
    )
  }

  async getComment(_credentials: Credentials, _id: string): Promise<Comment> {
    return refuse(
      'read a comment',
      'the API reference documents no comments resource; comments appear only as JSON-patch paths ("/comments/-") on PATCH /tasks/{id}',
    )
  }

  // ── Tags (labels) ──────────────────────────────────────────────────────────

  async listTags(
    _credentials: Credentials,
    _workspaceId: string,
    _params: QueryParams,
  ): Promise<Tag[]> {
    return refuse('list labels', NEEDS_COMPANY_ID)
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    return refuse('read a label', NEEDS_COMPANY_ID)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(
    _credentials: Credentials,
    _workspaceId: string,
    _params: QueryParams,
  ): Promise<User[]> {
    return refuse('list users', NEEDS_COMPANY_ID)
  }

  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    return refuse('read a user', NEEDS_COMPANY_ID)
  }
}
