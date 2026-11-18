/**
 * Huly Connect Link: an API token (a JWT whose payload carries `workspace`,
 * huly.core packages/token/src/token.ts) plus the "Base URL" shown under
 * Settings → API Tokens → Using the REST API.
 */
import { describe, it, expect } from 'vitest'
import { HulyAdapter } from '../../../../../../src/verticals/projects/adapters/huly/index'
import { workspaceFromToken } from '../../../../../../src/verticals/projects/adapters/huly/auth'

const WS = '3f2c9a4e-8d1b-4c6f-9e2a-5b7d1c0f4e88'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (payload: unknown) => `${b64({ typ: 'JWT', alg: 'HS256' })}.${b64(payload)}.sig`
const TOKEN = jwt({ account: 'acc-1', workspace: WS })
const BASE = 'https://transactor.example.test/api/v1'

describe('huly exchangeCredentials', () => {
  const adapter = new HulyAdapter()

  it('declares the token and base URL fields', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['apiToken', true],
      ['apiBaseUrl', true],
    ])
  })

  it('stores the token, the base URL and the workspace UUID from the token', async () => {
    await expect(
      adapter.exchangeCredentials({ apiToken: ` ${TOKEN} `, apiBaseUrl: `${BASE}/` }),
    ).resolves.toEqual({
      accessToken: TOKEN,
      extra: { apiBaseUrl: BASE, workspaceId: WS },
    })
  })

  it('rejects a token that carries no workspace', async () => {
    await expect(
      adapter.exchangeCredentials({ apiToken: jwt({ account: 'a' }), apiBaseUrl: BASE }),
    ).rejects.toThrow(/workspace/)
    await expect(
      adapter.exchangeCredentials({ apiToken: 'not-a-jwt', apiBaseUrl: BASE }),
    ).rejects.toThrow(/workspace/)
  })

  it('rejects a base URL that is not the /api/v1 Base URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiToken: TOKEN, apiBaseUrl: 'https://huly.app' }),
    ).rejects.toThrow(/api\/v1/)
    await expect(
      adapter.exchangeCredentials({ apiToken: TOKEN, apiBaseUrl: 'not a url' }),
    ).rejects.toThrow(/URL/)
    await expect(adapter.exchangeCredentials({ apiToken: TOKEN, apiBaseUrl: '' })).rejects.toThrow(
      /required/,
    )
  })

  it('workspaceFromToken reads the payload workspace claim', () => {
    expect(workspaceFromToken(TOKEN)).toBe(WS)
    expect(workspaceFromToken('a.b')).toBeUndefined()
  })
})
