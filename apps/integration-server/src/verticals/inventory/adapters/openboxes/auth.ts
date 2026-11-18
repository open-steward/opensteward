import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('openboxes uses username + password credentials; use credentialFields() instead')
}

/**
 * OpenBoxes authenticates via username/password POSTed to /api/login,
 * which returns a JSESSIONID session cookie.  We store the cookie value
 * as accessToken and the instance base URL in extra.baseUrl.
 */
export function credentialFields(): CredentialField[] {
  return [
    { name: 'baseUrl', label: 'Instance URL (e.g. https://demo.openboxes.com)', type: 'text', required: true },
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/+$/, '')
  const username = fields['username']
  const password = fields['password']
  if (!baseUrl || !username || !password) {
    throw new Error('openboxes requires baseUrl, username, and password')
  }
  // POST to /openboxes/api/login — returns session cookie JSESSIONID
  const loginUrl = `${baseUrl}/openboxes/api/login`
  const resp = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!resp.ok) {
    throw new Error(`openboxes login failed: ${resp.status} ${resp.statusText}`)
  }
  // Extract JSESSIONID from Set-Cookie header
  const setCookie = resp.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/JSESSIONID=([^;]+)/)
  const sessionId = match ? match[1] : ''
  if (!sessionId) {
    throw new Error('openboxes login did not return a JSESSIONID cookie')
  }
  return {
    accessToken: sessionId,
    extra: { baseUrl: `${baseUrl}/openboxes/api`, username },
  }
}
