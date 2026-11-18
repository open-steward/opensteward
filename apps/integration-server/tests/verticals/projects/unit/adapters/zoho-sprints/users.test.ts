/**
 * Zoho Sprints listUsers / getUser against the documented "Get workspace
 * users" endpoint (https://sprints.zoho.com/apidoc.html, Users tab):
 *
 *   GET /team/{teamId}/users/  scope ZohoSprints.teamusers.READ
 *   Parameters: action "Set value as data", index "Index from which the
 *   listing has to start.", range "No. of records that have to be listed.",
 *   type (1 Workspace Users, 2 Client Users, 3 Vendor Users).
 *
 * Pagination section: index "Valid Index starts from 1."; range "The maximum
 * limit is 250."; next "If more data is available after listing the range,
 * this param will be set to 'true', else 'false'."
 *
 * Before the rebuild listUsers read an undocumented `users[]` array (always
 * [] against the real response), sent `cursor` as `index` and ignored `page`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ZohoSprintsAdapter } from '../../../../../../src/verticals/projects/adapters/zoho-sprints/index'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

const CREDS = { accessToken: 'tok' }
const TEAM = '6000000004'
const L = 3
const N = 2 * L + 1
const DOCUMENTED = new Set(['action', 'index', 'range', 'type'])

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(2000000000001 + i))

/** A fake that honours only the documented parameters and the documented response shape. */
function fakeUsers(n = N) {
  const all = ids(n)
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (path !== `/team/${TEAM}/users/`) throw new Error(`unexpected path ${path}`)
    const p = config?.params ?? {}
    for (const k of Object.keys(p))
      if (!DOCUMENTED.has(k)) throw new Error(`undocumented param ${k}`)
    if (p['action'] !== 'data') throw new Error('action must be data')
    const index = Number(p['index'])
    const range = Number(p['range'])
    if (!Number.isInteger(index) || index < 1) throw new Error(`bad index ${String(p['index'])}`)
    if (!Number.isInteger(range) || range < 1 || range > 250)
      throw new Error(`bad range ${String(p['range'])}`)
    const slice = all.slice(index - 1, index - 1 + range)
    return {
      data: {
        userJObj: Object.fromEntries(
          slice.map((id) => [
            id,
            [`User ${id}`, `u${id}@zylker.com`, true, '22572213', 1, 0, 'r', 'p'],
          ]),
        ),
        next: index - 1 + range < all.length,
        userIds: slice,
        user_prop: {
          displayName: 0,
          emailId: 1,
          isConfirmed: 2,
          iamUserId: 3,
          userStatus: 4,
          addedVia: 5,
          roleId: 6,
          profileId: 7,
        },
        status: 'success',
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get, all }
}

const adapter = () =>
  new ZohoSprintsAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x.test/cb' })

afterEach(() => vi.restoreAllMocks())

describe('zoho-sprints listUsers (GET /team/{teamId}/users/)', () => {
  it('sends action=data with a 1-based record index and range = limit', async () => {
    const { get } = fakeUsers()
    await adapter().listUsers(CREDS, TEAM, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]?.[1]).toEqual({ params: { action: 'data', index: L + 1, range: L } })
  })

  it('page 1 starts at index 1', async () => {
    const { get } = fakeUsers()
    await adapter().listUsers(CREDS, TEAM, withPageSink({ page: 1, limit: L }))
    expect(get.mock.calls[0]?.[1]).toEqual({ params: { action: 'data', index: 1, range: L } })
  })

  it('walks N = 2L+1 users: every id once, in order, hasMore from `next`', async () => {
    const { all } = fakeUsers()
    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const users = await adapter().listUsers(CREDS, TEAM, params)
      for (const u of users) UserSchema.parse(u)
      expect(users.length).toBe(page < 3 ? L : 1)
      seen.push(...users.map((u) => u.id))
      expect(readUpstreamPage(params)?.hasMore).toBe(page < 3)
    }
    expect(seen).toEqual(all)
    expect(new Set(seen).size).toBe(N)
  })

  it('maps the documented positional rows to canonical users', async () => {
    fakeUsers()
    const [u] = await adapter().listUsers(CREDS, TEAM, withPageSink({ page: 1, limit: 1 }))
    expect(u).toMatchObject({
      id: '2000000000001',
      name: 'User 2000000000001',
      email: 'u2000000000001@zylker.com',
      workspaceIds: [TEAM],
    })
  })

  it('clamps range to the documented 250 and reports the size it sent', async () => {
    const { get } = fakeUsers(600)
    const params = withPageSink({ page: 2, limit: 500 })
    const users = await adapter().listUsers(CREDS, TEAM, params)
    expect(get.mock.calls[0]?.[1]).toEqual({ params: { action: 'data', index: 251, range: 250 } })
    expect(users.length).toBe(250)
    expect(users[0]?.id).toBe(ids(600)[250])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 250 })
  })

  it('reports no hasMore when the response carries no `next`', async () => {
    const { get } = fakeUsers()
    get.mockImplementationOnce((async () => ({
      data: {
        userJObj: { '2000000000001': ['User 1', 'u1@zylker.com', true, '1', 1, 0, 'r', 'p'] },
        userIds: ['2000000000001'],
        user_prop: { displayName: 0, emailId: 1 },
        status: 'success',
      },
    })) as never)
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listUsers(CREDS, TEAM, params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('does not report a page size when the limit fits', async () => {
    fakeUsers()
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listUsers(CREDS, TEAM, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe('zoho-sprints getUser (no single-user GET is documented)', () => {
  it('walks pages of 250 until it finds the user', async () => {
    const { get, all } = fakeUsers(600)
    const u = await adapter().getUser(CREDS, all[520]!, { workspace_id: TEAM })
    expect(u.id).toBe(all[520])
    expect(
      get.mock.calls.map((c) => (c[1] as { params: Record<string, unknown> }).params['index']),
    ).toEqual([1, 251, 501])
    for (const c of get.mock.calls)
      expect((c[1] as { params: Record<string, unknown> }).params['range']).toBe(250)
  })

  it('stops on an empty page even when `next` claims more', async () => {
    const { get } = fakeUsers()
    get.mockImplementation((async () => {
      if (get.mock.calls.length > 3) throw new Error('looped past an empty page')
      return { data: { userJObj: {}, userIds: [], user_prop: {}, next: true, status: 'success' } }
    }) as never)
    await expect(adapter().getUser(CREDS, 'nope', { workspace_id: TEAM })).rejects.toThrow(
      /not found/,
    )
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('stops at next=false and reports not found', async () => {
    const { get } = fakeUsers(5)
    await expect(adapter().getUser(CREDS, 'nope', { workspace_id: TEAM })).rejects.toThrow(
      /not found/,
    )
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('requires workspace_id and sends nothing without it', async () => {
    const { get } = fakeUsers()
    await expect(adapter().getUser(CREDS, '1', {})).rejects.toThrow(/workspace_id/)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('zoho-sprints OAuth scopes', () => {
  it('requests ZohoSprints.teamusers.READ, the documented scope of Get workspace users', () => {
    const url = new URL(adapter().getAuthUrl('st'))
    expect(url.searchParams.get('scope')?.split(',')).toContain('ZohoSprints.teamusers.READ')
  })
})
