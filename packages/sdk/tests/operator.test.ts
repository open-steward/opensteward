/**
 * Operator client unit tests.
 *
 * Asserts the auth-helper contract: `.login()` stores a JWT, subsequent
 * calls carry it, `.fromCredentialsFile()` reads disk, `.logout()`
 * clears state.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createOperatorClient } from '../src/operator'

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

function fakeFetch(handler: (req: CapturedRequest) => { status: number; body: unknown }) {
  const captured: CapturedRequest[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input as RequestInfo, init)
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => { headers[k] = v })
    const cap: CapturedRequest = {
      url: req.url,
      method: req.method,
      headers,
      body: init?.body ? String(init.body) : null,
    }
    captured.push(cap)
    const { status, body } = handler(cap)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetch, captured }
}

describe('createOperatorClient', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts without a token', () => {
    const client = createOperatorClient({ baseUrl: 'http://localhost:3001' })
    expect(client.getToken()).toBeNull()
  })

  it('accepts an initial token via constructor', () => {
    const client = createOperatorClient({ baseUrl: 'http://localhost:3001', token: 'preset' })
    expect(client.getToken()).toBe('preset')
  })

  it('.login stores the returned JWT and subsequent calls carry it', async () => {
    const { fetch, captured } = fakeFetch((req) => {
      if (req.url.endsWith('/api/auth/login')) {
        return { status: 200, body: { token: 'jwt-abc', user: { id: 'u-1' } } }
      }
      return { status: 200, body: { users: [] } }
    })
    globalThis.fetch = fetch

    const client = createOperatorClient({ baseUrl: 'http://localhost:3001' })
    const res = await client.login('admin', 'pw')

    expect(res.token).toBe('jwt-abc')
    expect(client.getToken()).toBe('jwt-abc')

    // The next typed call must include the Authorization header.
    await client.GET('/api/users' as never, {} as never)
    const userListReq = captured.find((c) => c.url.endsWith('/api/users'))
    expect(userListReq).toBeDefined()
    expect(userListReq!.headers.authorization).toBe('Bearer jwt-abc')
  })

  it('.login throws when the server rejects credentials', async () => {
    const { fetch } = fakeFetch(() => ({ status: 401, body: { error: 'nope' } }))
    globalThis.fetch = fetch
    const client = createOperatorClient({ baseUrl: 'http://localhost:3001' })
    await expect(client.login('admin', 'bad')).rejects.toThrow(/login failed/)
    expect(client.getToken()).toBeNull()
  })

  it('.setToken replaces the stored JWT', () => {
    const client = createOperatorClient({ baseUrl: 'http://localhost:3001' })
    client.setToken('manual-jwt')
    expect(client.getToken()).toBe('manual-jwt')
    client.setToken(null)
    expect(client.getToken()).toBeNull()
  })

  it('.logout clears the stored JWT (even if the server 4xx\'s)', async () => {
    const { fetch } = fakeFetch(() => ({ status: 401, body: { error: 'expired' } }))
    globalThis.fetch = fetch
    const client = createOperatorClient({ baseUrl: 'http://localhost:3001', token: 'old-jwt' })
    await client.logout()
    expect(client.getToken()).toBeNull()
  })

  describe('.fromCredentialsFile', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'opensteward-sdk-test-'))
    })
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('reads the JWT out of a credentials JSON file', () => {
      const path = join(dir, 'credentials.json')
      writeFileSync(path, JSON.stringify({ token: 'file-jwt', baseUrl: 'http://localhost:3001' }))
      const client = createOperatorClient({ baseUrl: 'http://localhost:3001' })
      client.fromCredentialsFile(path)
      expect(client.getToken()).toBe('file-jwt')
    })

    it('throws on a malformed credentials file', () => {
      const path = join(dir, 'credentials.json')
      writeFileSync(path, JSON.stringify({ notToken: 'oops' }))
      const client = createOperatorClient({ baseUrl: 'http://localhost:3001' })
      expect(() => client.fromCredentialsFile(path)).toThrow(/missing a "token"/)
    })
  })
})
