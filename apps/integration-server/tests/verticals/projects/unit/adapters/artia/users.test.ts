/**
 * Artia users: listUsers / getUser on the documented organisation-user queries.
 *
 * https://documenter.getpostman.com/view/10208526/TVCZaWK4
 *   "Listar Usuários da Organização": "Lista todos os usuários da organização.
 *    Não requer parâmetros."  → listingOrganizationUsers, no arguments.
 *   "Buscar Usuário da Organização": "O campo user_id é obrigatório."
 *    → showOrganizationUser(userId: …).
 *
 * The fake accepts only these two documented fields with only their documented
 * arguments, so the old fabricated `listingUsers(accountId)` / `showUser`
 * queries fail here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ArtiaAdapter } from '../../../../../../src/verticals/projects/adapters/artia/index'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

const CREDS = {
  accessToken: 'tok',
  extra: { clientId: 'c', secret: 's', organizationId: '7' },
}

const L = 3
const N = 2 * L + 1

function orgUsers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(1000 + i),
    userId: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@acme.example`,
    role: 'user',
    suspended: false,
  }))
}

interface Body {
  query: string
  variables?: Record<string, unknown>
}

function fakeArtia(n = N) {
  const users = orgUsers(n)
  const post = vi.fn(async (_path: string, body: Body) => {
    const q = body.query
    if (/listingOrganizationUsers\s*\{/.test(q)) {
      if (body.variables && Object.keys(body.variables).length > 0) {
        throw new Error(
          `listingOrganizationUsers takes no arguments, got ${JSON.stringify(body.variables)}`,
        )
      }
      return { data: { data: { listingOrganizationUsers: users } } }
    }
    // Documented example: showOrganizationUser( userId: 1 ), an integer literal.
    const show = /showOrganizationUser\(userId: (\d+)\)/.exec(q)
    if (show) {
      if (body.variables && Object.keys(body.variables).length > 0) {
        throw new Error(`undocumented variables ${JSON.stringify(body.variables)}`)
      }
      const found = users.find((u) => u.userId === Number(show[1]))
      return { data: { data: { showOrganizationUser: found ?? null } } }
    }
    throw new Error(`undocumented query: ${q}`)
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return { post, create }
}

const adapter = () => new ArtiaAdapter()

afterEach(() => vi.restoreAllMocks())

describe('artia listUsers', () => {
  it('posts listingOrganizationUsers with no arguments and the OrganizationId header', async () => {
    const { post, create } = fakeArtia()
    await adapter().listUsers(CREDS, 'ignored', withPageSink({ page: 2, limit: L }))
    expect(post).toHaveBeenCalledTimes(1)
    const body = post.mock.calls[0]![1] as Body
    expect(body.query).toMatch(/listingOrganizationUsers\s*\{/)
    expect(body.query).not.toMatch(/listingUsers/)
    expect(body.variables).toBeUndefined()
    const cfg = create.mock.calls[0]![0] as { headers: Record<string, string> }
    expect(cfg.headers['OrganizationId']).toBe('7')
  })

  it('every row parses as a canonical User keyed by userId', async () => {
    fakeArtia()
    const users = await adapter().listUsers(CREDS, 'ignored', withPageSink({ page: 1, limit: 50 }))
    expect(users.map((u) => UserSchema.parse(u).id)).toEqual(
      orgUsers(N).map((u) => String(u.userId)),
    )
  })

  it('walks pages 1..3 at limit L: every id once, exact hasMore and total', async () => {
    fakeArtia()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await adapter().listUsers(CREDS, 'ignored', params)).map((u) => u.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expectedHasMore[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(orgUsers(N).map((u) => String(u.userId)))
    expect(new Set(seen).size).toBe(N)
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeArtia()
    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env = listPage(await adapter().listUsers(CREDS, 'ignored', p3), p3, 'artia')
    expect(env.data.length).toBe(1)
    expect(env.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })

  it('throws on a GraphQL error instead of reporting an empty, complete list', async () => {
    const post = vi.fn(async () => ({ data: { errors: [{ message: 'Unauthorized' }] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
    await expect(
      adapter().listUsers(CREDS, 'ignored', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/Unauthorized/)
  })
})

describe('artia getUser', () => {
  it('reads back an id listUsers returned via showOrganizationUser(userId)', async () => {
    const { post } = fakeArtia()
    const [first] = await adapter().listUsers(CREDS, 'ignored', withPageSink({ page: 1, limit: 1 }))
    const u = UserSchema.parse(await adapter().getUser(CREDS, first!.id))
    expect(u.id).toBe(first!.id)
    const body = post.mock.calls[1]![1] as Body
    expect(body.query).toMatch(/showOrganizationUser\(userId: 1\)/)
    expect(body.variables).toBeUndefined()
  })

  it('throws when the user is not found', async () => {
    fakeArtia()
    await expect(adapter().getUser(CREDS, '999')).rejects.toThrow(/not found/)
  })

  it('throws the upstream GraphQL error, not "not found"', async () => {
    const post = vi.fn(async () => ({ data: { errors: [{ message: 'Unauthorized' }] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
    await expect(adapter().getUser(CREDS, '1')).rejects.toThrow(
      /showOrganizationUser error: Unauthorized/,
    )
  })

  it.each(['abc', '', ' ', '0x10', '1e3', '-1', '1.5', '1) { id } #'])(
    'rejects the non-integer id %j without sending a request',
    async (bad) => {
      const { post } = fakeArtia()
      await expect(adapter().getUser(CREDS, bad)).rejects.toMatchObject({ statusCode: 400 })
      expect(post).not.toHaveBeenCalled()
    },
  )
})
