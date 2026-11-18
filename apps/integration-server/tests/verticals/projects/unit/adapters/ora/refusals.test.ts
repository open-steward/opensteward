/**
 * Ora comments and workspaces are refused before any request is sent.
 *
 * Ora's Swagger spec (https://api.ora.pm/swagger.json, the reference the
 * vendor's getting-started page names) is the only API reference:
 *
 * - Comments: the only list is GET /projects/{project_id}/tasks/{task_id}/
 *   comments, and its response model "Task Comment" documents only `comment`,
 *   `created_at`, `updated_at` and `public`: no comment id and no author, both
 *   required canonical fields. /tasks/{id}/comments and /comments/{id} are not
 *   in the spec, and .../comments/{comment_id} has only PUT and DELETE.
 * - Workspaces: GET /organizations ("Get user organizations") exists, but its
 *   response model "Organization" documents no id field. /user/current, which
 *   the adapter read an `organizations` array from, is not in the spec, and
 *   /organizations/{organization_id} has only PUT and DELETE.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter } from 'axios'
import { withPageSink } from '@opensteward/shared'
import { OraAdapter } from '../../../../../../src/verticals/projects/adapters/ora/index'

const adapter = new OraAdapter()
const CREDS = { accessToken: 'ora_test' }
const realAdapter = axios.defaults.adapter
let requests = 0

beforeEach(() => {
  requests = 0
  axios.defaults.adapter = (async () => {
    requests++
    throw new Error('Ora must not be called')
  }) as unknown as AxiosAdapter
})

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

const CASES: Array<[string, () => Promise<unknown>, RegExp]> = [
  [
    'listComments (bare task id)',
    () => adapter.listComments(CREDS, '7', withPageSink({ page: 1, limit: 10 })),
    /cannot list comments: .*no comment id and no author/,
  ],
  [
    'listComments (project/task id)',
    () => adapter.listComments(CREDS, '42/7', withPageSink({ page: 2, limit: 10 })),
    /cannot list comments: .*no comment id and no author/,
  ],
  ['getComment', () => adapter.getComment(CREDS, '9'), /cannot read a comment/],
  [
    'listWorkspaces',
    () => adapter.listWorkspaces(CREDS, withPageSink({ page: 1, limit: 10 })),
    /cannot list workspaces/,
  ],
  ['getWorkspace', () => adapter.getWorkspace(CREDS, '3'), /cannot read a workspace/],
]

describe('Ora refused reads', () => {
  it.each(CASES)(
    '%s throws 501 NOT_SUPPORTED and sends no request',
    async (_name, run, message) => {
      const err = await run().then(
        () => undefined,
        (e: unknown) => e as Error & { statusCode?: number; code?: string },
      )
      expect(err).toBeInstanceOf(Error)
      expect(err?.statusCode).toBe(501)
      expect(err?.code).toBe('NOT_SUPPORTED')
      expect(err?.message).toMatch(/^Ora /)
      expect(err?.message).toMatch(message)
      expect(requests).toBe(0)
    },
  )
})
