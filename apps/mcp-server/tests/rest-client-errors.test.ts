/**
 * The MCP client threw away the server's explanation for most failures.
 *
 * `request()` only extracted a message when the body's `error` field was an
 * OBJECT — the `{code, message}` shape the auth middleware uses. Every resource
 * router replies with a flat STRING instead (`{ error: 'Not implemented' }`,
 * `{ error: 'listDeals not implemented by this adapter' }`), so the check fell
 * through to a bare `HTTP 501` and the agent never saw the sentence that would
 * have told it what to do.
 *
 * That compounded the error-taxonomy defect it sits on top of: even once the
 * server distinguishes "wrong vertical" from "unmapped for this platform", an
 * agent reading `HTTP 501` for both cannot act on the difference.
 */
import { describe, it, expect } from 'vitest'
import { extractErrorMessage } from '../src/rest-client'

describe('extractErrorMessage', () => {
  it('reads the flat string shape every resource router uses', () => {
    expect(extractErrorMessage({ error: 'listDeals not implemented by this adapter' }, 501)).toBe(
      'listDeals not implemented by this adapter',
    )
  })

  it('reads the message out of the structured shape', () => {
    const body = {
      error: {
        code: 'VERTICAL_MISMATCH',
        message: "This connection belongs to the 'accounting' vertical",
      },
    }
    expect(extractErrorMessage(body, 400)).toContain("belongs to the 'accounting' vertical")
  })

  it('keeps the code alongside the message, so an agent can branch on it', () => {
    const body = { error: { code: 'UPSTREAM_ERROR', message: 'The platform returned 400.' } }
    const out = extractErrorMessage(body, 502)
    expect(out).toContain('UPSTREAM_ERROR')
    expect(out).toContain('The platform returned 400.')
  })

  it('surfaces upstream detail when the server relayed it', () => {
    const body = {
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'The upstream platform returned 400.',
        upstreamStatus: 400,
        upstreamBody: '{"message":"Ogiltig begäran"}',
      },
    }
    const out = extractErrorMessage(body, 502)
    expect(out).toContain('Ogiltig')
  })

  it('falls back to the bare status only when the body carries nothing usable', () => {
    expect(extractErrorMessage({}, 500)).toBe('HTTP 500')
    expect(extractErrorMessage(undefined, 500)).toBe('HTTP 500')
    expect(extractErrorMessage('', 404)).toBe('HTTP 404')
  })

  it('does not crash on a body that is not an object', () => {
    expect(extractErrorMessage('Service Unavailable', 503)).toBe('Service Unavailable')
    expect(extractErrorMessage(12345, 503)).toBe('HTTP 503')
  })
})
