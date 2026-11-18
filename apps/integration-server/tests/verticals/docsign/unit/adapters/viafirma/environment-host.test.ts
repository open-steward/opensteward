/**
 * Viafirma's hosts are NOT per-customer for the managed service: an OAuth
 * client is registered on one Fortress server, so the environment follows the
 * deployment's client registration — production (fortress.viafirma.com +
 * documents.viafirma.com) or sandbox (sandbox.viafirma.com).
 *
 * The adapter hard-defaulted to the sandbox Fortress, took the production
 * host only from a `fortressUrl` config key the admin UI cannot write, never
 * declared `supportsSandbox` (so the UI offered no toggle), and the API
 * client read an `extra.baseUrl` the exchange never stored — so every
 * connection, production or not, authorised on and called the sandbox.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ViafirmaAdapter } from '../../../../../../src/verticals/docsign/adapters/viafirma/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/docsign/viafirma/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 3600, user_code: 'U1' }

function fakeHttp() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () => (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ViafirmaAdapter environment hosts', () => {
  it('declares supportsSandbox so the admin UI offers the environment toggle', () => {
    expect(new ViafirmaAdapter(CFG).capabilities).toMatchObject({ supportsSandbox: true })
  })

  it('does not ask the customer for a host', () => {
    expect((new ViafirmaAdapter(CFG) as { oauthFields?: unknown }).oauthFields).toBeUndefined()
  })

  it('authorises on the production Fortress by default', () => {
    const u = new URL(new ViafirmaAdapter(CFG).getAuthUrl('st'))
    expect(u.host).toBe('fortress.viafirma.com')
    expect(u.pathname).toBe('/fortress/oauth2/v1/auth')
  })

  it('authorises on the sandbox Fortress when the deployment selects sandbox', () => {
    const u = new URL(new ViafirmaAdapter({ ...CFG, sandbox: true }).getAuthUrl('st'))
    expect(u.host).toBe('sandbox.viafirma.com')
    expect(u.pathname).toBe('/fortress/oauth2/v1/auth')
  })

  it('exchanges on the production Fortress and stores both hosts with the credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await new ViafirmaAdapter(CFG).exchangeCode('code', CFG.redirectUri)
    expect(post.mock.calls[0][0]).toBe('https://fortress.viafirma.com/fortress/fortress/oauth2/v1/token')
    expect(creds.extra).toEqual({
      userCode: 'U1',
      fortressUrl: 'https://fortress.viafirma.com/fortress',
      baseUrl: 'https://documents.viafirma.com',
    })
  })

  it('stores the sandbox Documents host for a sandbox deployment', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await new ViafirmaAdapter({ ...CFG, sandbox: true }).exchangeCode('code', CFG.redirectUri)
    expect(creds.extra).toMatchObject({
      fortressUrl: 'https://sandbox.viafirma.com/fortress',
      baseUrl: 'https://sandbox.viafirma.com',
    })
  })

  it('calls the Documents API on the host stored with the credentials', async () => {
    const baseURL = fakeHttp()
    await new ViafirmaAdapter(CFG)
      .getEnvelope({ accessToken: 'tok', extra: { baseUrl: 'https://documents.viafirma.com' } }, 'SET1')
      .catch(() => undefined) // the transform of an empty SET is not under test
    expect(baseURL()).toBe('https://documents.viafirma.com/documents/api/v3')
  })
})
