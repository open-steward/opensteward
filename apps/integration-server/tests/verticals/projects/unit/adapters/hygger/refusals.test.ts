/**
 * Hygger: every read method refuses (501 NOT_SUPPORTED) before any request.
 *
 * The API Blueprint behind https://hygger.docs.apiary.io/
 * (https://jsapi.apiary.io/apis/hygger.apib) documents
 *   "HOST: https://api.hygger.io/public-api/"
 *   "### List Boards [GET /boards{?expand,sort,offset,limit,project,closed}]"
 *   "### List Tasks [GET /tasks{?expand,sort,offset,limit,board,project,...}]"
 *   "### List Labels [GET /labels{?expand,sort,offset,limit,board,labels_ids,labels_id}]"
 *   "### List Users [GET /users{?expand,sort,offset,limit,board,deleted,confirmed,type}]"
 * but the live host answers every one of them, and every get-by-id, with
 *   "GET parameter company_id is required and must be abs int"
 * a parameter the reference never names and this connection (one token) does
 * not carry. Comments and workspaces have no resource in the reference:
 * comments are only JSON-patch paths on PATCH /tasks/{id}; the company
 * operations are writes only (POST /companies, PATCH /users-companies/{id}),
 * and the nearest container, "List Projects [GET /projects{...}]", documents no
 * response body and is rejected live for the same missing company_id.
 */
import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest'
import axios from 'axios'
import { parseListQuery, type QueryParams } from '@opensteward/shared'
import { HyggerAdapter } from '../../../../../../src/verticals/projects/adapters/hygger/index'

const CREDS = { accessToken: 'hygger-token' }

type Call = (a: HyggerAdapter, q: QueryParams) => Promise<unknown>

const COMPANY = /company_id is required/
const NO_RESOURCE = /documents no comments resource/
// Workspaces: no workspace resource, company operations are writes only, and
// the nearest container (GET /projects) needs the same undocumented company_id.
const NO_WORKSPACE =
  /documents no workspace resource.*POST \/companies.*PATCH \/users-companies\/\{id\}.*GET \/projects.*company_id is required/

const METHODS: { name: string; call: Call; message: RegExp }[] = [
  { name: 'listProjects', call: (a, q) => a.listProjects(CREDS, q), message: COMPANY },
  { name: 'getProject', call: (a) => a.getProject(CREDS, '1'), message: COMPANY },
  { name: 'listTasks', call: (a, q) => a.listTasks(CREDS, '1', q), message: COMPANY },
  { name: 'getTask', call: (a) => a.getTask(CREDS, '1'), message: COMPANY },
  { name: 'listTags', call: (a, q) => a.listTags(CREDS, '1', q), message: COMPANY },
  { name: 'getTag', call: (a) => a.getTag(CREDS, '1'), message: COMPANY },
  { name: 'listUsers', call: (a, q) => a.listUsers(CREDS, '1', q), message: COMPANY },
  { name: 'getUser', call: (a) => a.getUser(CREDS, '1'), message: COMPANY },
  { name: 'listComments', call: (a, q) => a.listComments(CREDS, '1', q), message: NO_RESOURCE },
  { name: 'getComment', call: (a) => a.getComment(CREDS, '1'), message: NO_RESOURCE },
  { name: 'listWorkspaces', call: (a, q) => a.listWorkspaces(CREDS, q), message: NO_WORKSPACE },
  { name: 'getWorkspace', call: (a) => a.getWorkspace(CREDS, '1'), message: NO_WORKSPACE },
]

describe.each(METHODS)('hygger $name', ({ call, message }) => {
  let spies: MockInstance[] = []

  beforeEach(() => {
    const fail = () => {
      throw new Error('hygger sent a request')
    }
    spies = [
      vi.spyOn(axios, 'create').mockImplementation(fail) as unknown as MockInstance,
      vi.spyOn(axios, 'get').mockImplementation(fail) as unknown as MockInstance,
      vi.spyOn(axios, 'post').mockImplementation(fail) as unknown as MockInstance,
      vi.spyOn(axios, 'request').mockImplementation(fail) as unknown as MockInstance,
      vi.spyOn(globalThis, 'fetch').mockImplementation(fail) as unknown as MockInstance,
    ]
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([{}, { page: '2', limit: '10' }])(
    'refuses with 501 NOT_SUPPORTED and sends no request (query %o)',
    async (q) => {
      await expect(call(new HyggerAdapter(), parseListQuery(q))).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Hygger cannot /),
      })
      await expect(call(new HyggerAdapter(), parseListQuery(q))).rejects.toThrow(message)
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    },
  )
})
