/**
 * SnapEngage has no user roster endpoint, so listUsers refuses before sending anything.
 *
 * From https://developer.snapengage.com/ (Provisioning API, Users), the only user
 * operations are:
 *   "Create a new user account / Get existing user account details / Update an
 *    existing user account or find out if a user account exists / Delete an existing
 *    user account"
 * and the read is a single-account lookup:
 *   "GET /api/v1/user.json?api_key={api_key}&email={user_email}"
 *   email: "Required. A valid email address of an existing user."
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { withPageSink, type Credentials } from '@opensteward/shared'
import { SnapengageAdapter } from '../../../../../../src/verticals/customer-support/adapters/snapengage/index'

const creds: Credentials = { accessToken: 'se_test', extra: { orgId: 'org-1' } }
const adapter = new SnapengageAdapter()

let requests = 0

beforeEach(() => {
  requests = 0
  const send = async () => {
    requests++
    return { data: { email: 'agent@example.test', name: 'Agent', accountType: 'enterprise' } }
  }
  vi.spyOn(axios, 'get').mockImplementation(send)
  vi.spyOn(axios, 'request').mockImplementation(send)
  vi.spyOn(axios, 'create').mockImplementation(
    () => ({ get: send, request: send }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('snapengage listUsers', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await adapter
      .listUsers(creds, withPageSink({ page: 1, limit: 25 }))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/^SnapEngage cannot list users: /)
    expect(requests).toBe(0)
  })

  it('refuses even when the caller passes an email, rather than serving a one-row "list"', async () => {
    const err = await adapter
      .listUsers(creds, { page: 1, limit: 25, email: 'agent@example.test' })
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requests).toBe(0)
  })
})
