/**
 * `POST /v1/{vertical}/sync` accepts a `callback_url` and the worker POSTs the
 * finished job to it. With only `z.string().url()` validation, `sendCallback`
 * would `fetch(url, { method: 'POST' })` whatever came back — no scheme check,
 * no address check. That is a server-side request forgery
 * primitive: a caller could make the server POST to
 * `http://169.254.169.254/latest/meta-data/` (cloud instance metadata), to
 * another service on the compose network (`http://admin-api:3001/...`), or to
 * anything else reachable from inside the deployment, three times over with
 * backoff.
 *
 * Sync is a read operation — it pulls upstream data into the local store and
 * never writes back — so a `vertical:read` key can trigger one, which makes
 * this validation the control that has to hold.
 */
import { describe, it, expect } from 'vitest'
import { validateCallbackUrl } from '../../src/data-store/callback-url'

describe('callback URL validation', () => {
  it('accepts an ordinary https endpoint', () => {
    expect(validateCallbackUrl('https://hooks.acme.example/sync-done').ok).toBe(true)
  })

  it('rejects cloud instance metadata', () => {
    const r = validateCallbackUrl(
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/private|link-local|address/i)
  })

  it('rejects other services on the deployment network by IP', () => {
    for (const url of [
      'https://10.0.0.5/internal',
      'https://172.17.0.3/internal',
      'https://192.168.1.10/internal',
    ]) {
      expect(validateCallbackUrl(url).ok, url).toBe(false)
    }
  })

  it('rejects loopback in every spelling', () => {
    for (const url of [
      'https://127.0.0.1/x',
      'https://localhost/x',
      'https://[::1]/x',
      'https://127.1/x',
    ]) {
      expect(validateCallbackUrl(url).ok, url).toBe(false)
    }
  })

  it('rejects schemes that are not http(s)', () => {
    for (const url of ['file:///etc/passwd', 'ftp://acme.example/x', 'gopher://acme.example/x']) {
      expect(validateCallbackUrl(url).ok, url).toBe(false)
    }
  })

  it('rejects plaintext http by default — the job payload names connections and tenants', () => {
    expect(validateCallbackUrl('http://hooks.acme.example/sync-done').ok).toBe(false)
  })

  it('allows plaintext http only when the deployment opts in', () => {
    const r = validateCallbackUrl('http://hooks.acme.example/sync-done', { allowInsecure: true })
    expect(r.ok).toBe(true)
  })

  it('still rejects a private address even when insecure http is allowed', () => {
    // The opt-out is for TLS, not for the address rules.
    expect(validateCallbackUrl('http://10.0.0.5/x', { allowInsecure: true }).ok).toBe(false)
  })

  it('rejects embedded credentials, which would leak to the callback host', () => {
    expect(validateCallbackUrl('https://user:pass@hooks.acme.example/x').ok).toBe(false)
  })

  it('rejects garbage rather than throwing', () => {
    expect(validateCallbackUrl('not a url').ok).toBe(false)
    expect(validateCallbackUrl('').ok).toBe(false)
  })
})
