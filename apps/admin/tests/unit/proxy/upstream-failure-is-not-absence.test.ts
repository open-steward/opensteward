/**
 * The proxy client must not answer "there is nothing there" for "I could not ask".
 *
 * The rule these tests pin: a 404 is an answer and stays `null` / a no-op;
 * anything else — 5xx, 415, a refused connection — is a failure and must reach
 * the caller, where server.ts's error handler renders the upstream status and
 * message on a page the operator can act on.
 *
 * A `catch { return null }` in `getApiKey` would break both halves at once:
 * the detail route renders null as "key not found", so an unreachable
 * admin-api would tell the operator their API key had been deleted. Every
 * route above these methods handles a throw correctly (see
 * tests/journeys/upstream-failure-is-not-emptiness.test.ts); a swallow here
 * is the only thing that could stop the error from getting there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminApiClient } from '../../../src/core/proxy/admin-api-client'

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    })),
  },
}))

import axios from 'axios'

/** Upstream answered, and refused. */
const refusal = (status: number) => ({ response: { status }, message: `status ${status}` })
/** Upstream never answered at all — no `.response` to sniff. */
const unreachable = new Error('connect ECONNREFUSED admin-api:3001')

describe('AdminApiClient: a failed call is not an absent record', () => {
  let client: AdminApiClient
  let http: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new AdminApiClient('http://localhost:3001')
    http = vi.mocked(axios.create).mock.results[0]?.value
  })

  /**
   * Each row: the method, the verb it uses, and the value that means
   * "genuinely not there" for that method's signature.
   */
  const readers: Array<{
    name: string
    verb: 'get' | 'post'
    call: (c: AdminApiClient) => Promise<unknown>
  }> = [
    { name: 'getConnection', verb: 'get', call: (c) => c.getConnection('t', 'accounting', 'c-1') },
    { name: 'getIdentityProvider', verb: 'get', call: (c) => c.getIdentityProvider('t', 'idp-1') },
    { name: 'getConnectLinkTemplate', verb: 'get', call: (c) => c.getConnectLinkTemplate('t', 1) },
    { name: 'getEndUser', verb: 'get', call: (c) => c.getEndUser('t', 'eu-1') },
    { name: 'getConnectSession', verb: 'get', call: (c) => c.getConnectSession('t', 's-1') },
    { name: 'getSyncJob', verb: 'get', call: (c) => c.getSyncJob('t', 'job-1') },
    // null means "this admin-api predates GET /api/license"; anything else must
    // reach the System page, which shows admin-api's own reason (its 503 names
    // ADMIN_SECRET) instead of "it is older than this console".
    { name: 'getLicense', verb: 'get', call: (c) => c.getLicense('t') },
  ]

  for (const r of readers) {
    describe(r.name, () => {
      it('returns null when upstream says 404 — the record really is gone', async () => {
        http[r.verb].mockRejectedValue(refusal(404))
        await expect(r.call(client)).resolves.toBeNull()
      })

      it('throws when upstream refuses with a 5xx', async () => {
        http[r.verb].mockRejectedValue(refusal(503))
        await expect(r.call(client)).rejects.toBeDefined()
      })

      it('throws when admin-api cannot be reached at all', async () => {
        http[r.verb].mockRejectedValue(unreachable)
        await expect(r.call(client)).rejects.toThrow('ECONNREFUSED')
      })
    })
  }

  describe('getLicense: what it asks and what it returns', () => {
    it("asks GET /api/license with the session's token and unwraps the data envelope", async () => {
      const record = { state: 'VALID', renewalUrl: 'https://renew.example.test/x' }
      http.get.mockResolvedValue({ status: 200, data: { data: record } })
      await expect(client.getLicense('jwt-1')).resolves.toEqual(record)
      expect(http.get).toHaveBeenCalledWith('/api/license', {
        headers: { Authorization: 'Bearer jwt-1' },
      })
    })

    it("a 503 reaches the caller with admin-api's own reason", async () => {
      const unavailable = {
        response: {
          status: 503,
          data: { error: { code: 'LICENSE_STATUS_UNAVAILABLE', message: 'names ADMIN_SECRET' } },
        },
        message: 'status 503',
      }
      http.get.mockRejectedValue(unavailable)
      await expect(client.getLicense('t')).rejects.toBe(unavailable)
    })
  })

  /**
   * The write half. These returned `false` (or null) on every error and every
   * caller discarded it, so a refused delete rendered as the redirect that
   * means "done". They now throw; the routes let the error page say what
   * happened.
   */
  const writers: Array<{
    name: string
    verb: 'delete' | 'post' | 'patch'
    call: (c: AdminApiClient) => Promise<unknown>
  }> = [
    // A rename that could not be sent must not answer as though the label
    // were saved: the box would redisplay the new name from the form while
    // the connection still carries the old one.
    {
      name: 'updateConnectionLabel',
      verb: 'patch',
      call: (c) => c.updateConnectionLabel('t', 'accounting', 'c-1', 'New name'),
    },
    { name: 'deleteIdentityProvider', verb: 'delete', call: (c) => c.deleteIdentityProvider('t', 'idp-1') },
    { name: 'deleteRoleMapping', verb: 'delete', call: (c) => c.deleteRoleMapping('t', 'idp-1', 3) },
    { name: 'revokeScimToken', verb: 'delete', call: (c) => c.revokeScimToken('t', 'idp-1', 'tok-1') },
    { name: 'deleteConnection', verb: 'delete', call: (c) => c.deleteConnection('t', 'accounting', 'c-1') },
    { name: 'revokeEndUserToken', verb: 'delete', call: (c) => c.revokeEndUserToken('t', 'tok-1') },
    { name: 'deleteUser', verb: 'delete', call: (c) => c.deleteUser('t', 'u-1') },
    { name: 'deleteScopeGroup', verb: 'delete', call: (c) => c.deleteScopeGroup('t', 1) },
    { name: 'deleteConnectLinkTemplate', verb: 'delete', call: (c) => c.deleteConnectLinkTemplate('t', 1) },
    { name: 'cancelSyncJob', verb: 'post', call: (c) => c.cancelSyncJob('t', 'job-1') },
  ]

  for (const w of writers) {
    describe(w.name, () => {
      it('resolves when upstream accepts', async () => {
        http[w.verb].mockResolvedValue({ status: 204, data: { data: {} } })
        await expect(w.call(client)).resolves.not.toThrow()
      })

      it('throws when upstream refuses, rather than reporting a no-op', async () => {
        // 400 is the real case for deleteUser: admin-api refuses "delete
        // yourself". Swallowed, the operator clicked Delete and nothing at all
        // happened or was said.
        http[w.verb].mockRejectedValue(refusal(400))
        await expect(w.call(client)).rejects.toBeDefined()
      })

      it('throws when admin-api cannot be reached at all', async () => {
        http[w.verb].mockRejectedValue(unreachable)
        await expect(w.call(client)).rejects.toThrow('ECONNREFUSED')
      })
    })
  }
})
