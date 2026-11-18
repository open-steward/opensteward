/**
 * smartsupp — listUsers / getUser against the documented agents endpoints.
 *
 * Smartsupp REST API v2 OpenAPI (https://api.smartsupp.com/v2/specs/open-api.json):
 * GET /agents, "List agents", declares no parameters and answers
 * `{ "agents": [ <agent> ] }` with `"required": ["agents"]`. GET /agents/{id},
 * "Get agent", answers a bare `agent`. The fixtures below are the spec's own
 * `components.examples.agent_list` and `components.examples.agent`.
 *
 * The fake honours no parameters, because the endpoint documents none.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import { SmartsuppAdapter } from '../../../../../../src/verticals/customer-support/adapters/smartsupp/index'
import { SmartsuppClient } from '../../../../../../src/verticals/customer-support/adapters/smartsupp/client'
import {
  transformUser,
  type RawSmartsuppAgent,
} from '../../../../../../src/verticals/customer-support/adapters/smartsupp/transform/user'
import { UserSchema } from '../../../../../../src/verticals/customer-support/schema/user'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const creds = { accessToken: 'tok' } as Credentials
const adapter = new SmartsuppAdapter()

/** components.examples.agent.value, verbatim. */
const DOC_AGENT: RawSmartsuppAgent = {
  id: '1662873',
  email: 'john@doe.com',
  name: 'John Doe',
  avatar: 'https://files.smartsuppcdn.com/files/agents/avatars/136-dfIxxz2Oz6.png',
  description: 'Senior Support',
  role: 'agent',
  status: 'online',
  active: true,
}

const agent = (i: number): RawSmartsuppAgent => ({
  ...DOC_AGENT,
  id: String(1000 + i),
  email: `agent${i}@doe.com`,
  name: `Agent ${i}`,
})

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeAgents(total: number) {
  const calls: Call[] = []
  vi.spyOn(SmartsuppClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    calls.push({ path: p, params })
    if (p !== '/agents') throw new Error(`unexpected path in test: ${p}`)
    return { agents: Array.from({ length: total }, (_, i) => agent(i)) }
  }) as typeof SmartsuppClient.prototype.get)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('smartsupp transformUser (documented agent example)', () => {
  it('maps components.examples.agent to a schema-valid User', () => {
    const user = UserSchema.parse(transformUser(DOC_AGENT))
    expect(user).toMatchObject({
      id: '1662873',
      externalId: '1662873',
      email: 'john@doe.com',
      name: 'John Doe',
      role: 'agent',
      teamIds: [],
      platform: 'smartsupp',
      metadata: { status: 'online', active: 'true' },
    })
  })
})

describe('smartsupp listUsers reads the documented `agents` envelope', () => {
  it('returns the agents of the documented agent_list example', async () => {
    vi.spyOn(SmartsuppClient.prototype, 'get').mockResolvedValue({ agents: [DOC_AGENT] })
    const users = await adapter.listUsers(creds, withPageSink({ page: 1, limit: 10 }))
    expect(users.map((u) => UserSchema.parse(u).id)).toEqual(['1662873'])
  })

  it('sends GET /agents with no parameters', async () => {
    const calls = fakeAgents(3)
    await adapter.listUsers(creds, withPageSink({ page: 1, limit: 2 }))
    expect(calls).toEqual([{ path: '/agents', params: undefined }])
  })

  it('pages 1..3 of 2L+1 agents serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    fakeAgents(2 * L + 1)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listUsers(creds, params)
      ids.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(1000 + i)))
    expect(more).toEqual([true, true, false])
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    fakeAgents(11)
    const ids: string[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: '5', page: String(n) })
      const env = listPage(await adapter.listUsers(creds, params), params, 'smartsupp')
      ids.push(...env.data.map((x) => x.id))
      if (env.meta.hasMore !== true) break
    }
    expect(ids).toEqual(Array.from({ length: 11 }, (_, i) => String(1000 + i)))
  })
})

describe('smartsupp getUser reads the bare documented agent', () => {
  it('GET /agents/{id} maps to a schema-valid User', async () => {
    const spy = vi.spyOn(SmartsuppClient.prototype, 'get').mockResolvedValue(DOC_AGENT)
    const user = UserSchema.parse(await adapter.getUser(creds, '1662873'))
    expect(spy).toHaveBeenCalledWith('/agents/1662873')
    expect(user.id).toBe('1662873')
  })
})
