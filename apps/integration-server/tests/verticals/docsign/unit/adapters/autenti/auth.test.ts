/**
 * Autenti's OAuth endpoints, per "Authorization code grant"
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/a7847a3b741c6) and
 * "Refreshing tokens" (node 3b0065697f838): authorization at
 * https://api.autenti.com/api/v2/auth/authorization, token exchange as a JSON
 * POST to https://api.autenti.com/api/v2/auth/token.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AutentiAdapter } from '../../../../../../src/verticals/docsign/adapters/autenti'

const adapter = new AutentiAdapter({
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://app.example/cb',
})

afterEach(() => vi.restoreAllMocks())

/** The code-exchange response of "Authorization code grant" (node a7847a3b741c6), verbatim. */
const CODE_TOKEN = {
  access_token: '2YotnFZFEjr1zCsicMWpAA...sfddg2rf45y53736',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'sdf453yxf0XG5Qx2TlKWIA...43fgsdsfd6ghh',
  scope:
    'SUPER_ADMIN approval creation full list notification_management participation read read_one review signature',
}

/** The refresh response of "Refreshing tokens" (node 3b0065697f838), verbatim: no scope. */
const REFRESH_TOKEN = {
  access_token: '2YotnFZFEjr1zCsicMWpAA...sfddg2rf45y53736',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'sdf453yxf0XG5Qx2TlKWIA...43fgsdsfd6ghh',
}

describe('Autenti OAuth', () => {
  it('builds the documented authorization URL', () => {
    const url = new URL(adapter.getAuthUrl('st8'))
    expect(url.origin + url.pathname).toBe('https://api.autenti.com/api/v2/auth/authorization')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'https://app.example/cb',
      scope: 'read',
      response_type: 'code',
      response_mode: 'query',
      state: 'st8',
    })
  })

  it('exchanges a code with a JSON body at the documented token URL', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: CODE_TOKEN })
    const creds = await adapter.exchangeCode('code1', 'https://app.example/cb')
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://api.autenti.com/api/v2/auth/token')
    expect(body).toEqual({
      client_id: 'cid',
      client_secret: 'sec',
      grant_type: 'authorization_code',
      code: 'code1',
      redirect_uri: 'https://app.example/cb',
    })
    expect(config?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(creds.accessToken).toBe(CODE_TOKEN.access_token)
    expect(creds.refreshToken).toBe(CODE_TOKEN.refresh_token)
    expect(creds.scope).toBe(CODE_TOKEN.scope)
  })

  it('refreshes with a JSON body and keeps the new single-use refresh token', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: REFRESH_TOKEN })
    const creds = await adapter.refreshCredentials({
      accessToken: 'a',
      refreshToken: 'old',
      scope: 'read',
    } as Credentials)
    expect(post.mock.calls[0]![1]).toEqual({
      client_id: 'cid',
      client_secret: 'sec',
      grant_type: 'refresh_token',
      refresh_token: 'old',
    })
    expect(creds.refreshToken).toBe(REFRESH_TOKEN.refresh_token)
    // The refresh response carries no scope; the granted scope is kept.
    expect(creds.scope).toBe('read')
  })
})
