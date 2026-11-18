/**
 * What the projects sandbox serves.
 *
 * Projects is a small vertical — twelve methods, six resources, all
 * read-only.
 *
 * **Four of six resources are parent-scoped, and the parents form a chain.**
 * Docsign's three children all hang off the same top-level envelope, so one
 * level of resolution is enough there. Here a comment belongs to a task and
 * a task belongs to a project, and `/tasks` answers `400 MISSING_PARAM`
 * without `?project_id=`. Anything that resolves a parent by listing its
 * collection directly gets an error body rather than a parent.
 *
 * **`users` keys on an array.** `UserSchema.workspaceIds` is `string[]`,
 * unlike every other foreign key (scalars), so a record stamped with the
 * parent id verbatim fails its own schema. The seeder takes the shape from
 * the fixture rather than a manifest flag, so this needs no declaration
 * here — but it is the reason `foreignKey` is `'workspaceIds'` and not
 * `'workspaceId'`.
 *
 * Note `listTags` and `listUsers` also exist in customer-support at a
 * different arity — there they are top-level, here they take a workspace id.
 * Manifests are per-vertical so the collision is harmless, but it is a trap
 * for anything keyed by method name alone.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  CommentSchema,
  ProjectSchema,
  TagSchema,
  TaskSchema,
  UserSchema,
  WorkspaceSchema,
} from '../schema'

/** Both workspace-scoped resources arrive the same way. */
const UNDER_WORKSPACE = {
  resourceType: 'workspaces',
  // Counting args after `credentials`: (workspaceId, params) → workspaceId is 0.
  argIndex: 0,
  queryParam: 'workspace_id',
} as const

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'workspaces',
    schema: WorkspaceSchema,
    list: 'listWorkspaces',
    get: 'getWorkspace',
    seed: 2,
  },
  {
    resourceType: 'projects',
    schema: ProjectSchema,
    list: 'listProjects',
    get: 'getProject',
    seed: 3,
  },
  {
    // Level one of the chain.
    resourceType: 'tasks',
    schema: TaskSchema,
    list: 'listTasks',
    get: 'getTask',
    parent: {
      resourceType: 'projects',
      argIndex: 0,
      foreignKey: 'projectId',
      queryParam: 'project_id',
    },
    seed: 2,
  },
  {
    // Level two: its parent is itself parent-scoped.
    resourceType: 'comments',
    schema: CommentSchema,
    list: 'listComments',
    get: 'getComment',
    parent: {
      resourceType: 'tasks',
      argIndex: 0,
      foreignKey: 'taskId',
      queryParam: 'task_id',
    },
    seed: 2,
  },
  {
    resourceType: 'tags',
    schema: TagSchema,
    list: 'listTags',
    get: 'getTag',
    parent: { ...UNDER_WORKSPACE, foreignKey: 'workspaceId' },
    seed: 2,
  },
  {
    // `workspaceIds`, plural: this one is an array on the schema.
    resourceType: 'users',
    schema: UserSchema,
    list: 'listUsers',
    get: 'getUser',
    parent: { ...UNDER_WORKSPACE, foreignKey: 'workspaceIds' },
    seed: 2,
  },
]
