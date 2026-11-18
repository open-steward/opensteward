/**
 * The admin-secret guard fails CLOSED. A guard that opened automatically
 * whenever `NODE_ENV !== 'production'` would leave the whole operator
 * surface — connections, `/admin/*`, `/v1/sync`, connect-link tokens,
 * customer PII — reachable with no credential on any bespoke run that
 * forgets the production marker (and has no `ADMIN_SECRET`). So the only
 * way an unset secret opens the routes is the explicit
 * `OST_ALLOW_UNAUTH_ADMIN=1` local-dev opt-in.
 *
 * The shared test setup sets that flag globally (router tests run as trusted
 * local dev); this file removes it to exercise the closed path directly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { adminGuard } from '../../src/control-plane/admin-guard'

function fakeReq(headers: Record<string, string> = {}) {
  return { headers } as never
}
function fakeReply() {
  const captured: { status?: number; body?: unknown } = {}
  const reply = {
    status(code: number) {
      captured.status = code
      return reply
    },
    send(body: unknown) {
      captured.body = body
      return reply
    },
  }
  return { reply: reply as never, captured }
}

describe('adminGuard', () => {
  let prevSecret: string | undefined
  let prevFlag: string | undefined
  let prevNodeEnv: string | undefined

  beforeEach(() => {
    prevSecret = process.env['ADMIN_SECRET']
    prevFlag = process.env['OST_ALLOW_UNAUTH_ADMIN']
    prevNodeEnv = process.env['NODE_ENV']
    delete process.env['ADMIN_SECRET']
    delete process.env['OST_ALLOW_UNAUTH_ADMIN']
    delete process.env['NODE_ENV']
  })
  afterEach(() => {
    prevSecret === undefined
      ? delete process.env['ADMIN_SECRET']
      : (process.env['ADMIN_SECRET'] = prevSecret)
    prevFlag === undefined
      ? delete process.env['OST_ALLOW_UNAUTH_ADMIN']
      : (process.env['OST_ALLOW_UNAUTH_ADMIN'] = prevFlag)
    prevNodeEnv === undefined
      ? delete process.env['NODE_ENV']
      : (process.env['NODE_ENV'] = prevNodeEnv)
  })

  it('fails closed when ADMIN_SECRET is unset — even outside production', () => {
    // The dangerous combination: no secret, no production marker, no opt-in.
    const { reply, captured } = fakeReply()
    expect(adminGuard(fakeReq(), reply)).toBe(false)
    expect(captured.status).toBe(403)
    expect((captured.body as { error: { code: string } }).error.code).toBe('ADMIN_DISABLED')
  })

  it('opens only with the explicit OST_ALLOW_UNAUTH_ADMIN=1 opt-in', () => {
    process.env['OST_ALLOW_UNAUTH_ADMIN'] = '1'
    const { reply } = fakeReply()
    expect(adminGuard(fakeReq(), reply)).toBe(true)
  })

  it('a production marker does NOT open it (only the explicit flag does)', () => {
    process.env['NODE_ENV'] = 'development'
    const { reply, captured } = fakeReply()
    expect(adminGuard(fakeReq(), reply)).toBe(false)
    expect(captured.status).toBe(403)
  })

  it('with a secret set, requires a matching X-Admin-Secret header', () => {
    process.env['ADMIN_SECRET'] = 'a-real-admin-secret-32-chars-longer!!'
    // The flag is ignored once a secret exists.
    process.env['OST_ALLOW_UNAUTH_ADMIN'] = '1'

    const missing = fakeReply()
    expect(adminGuard(fakeReq(), missing.reply)).toBe(false)
    expect(missing.captured.status).toBe(403)

    const wrong = fakeReply()
    expect(adminGuard(fakeReq({ 'x-admin-secret': 'nope' }), wrong.reply)).toBe(false)
    expect(wrong.captured.status).toBe(403)

    const ok = fakeReply()
    expect(
      adminGuard(fakeReq({ 'x-admin-secret': 'a-real-admin-secret-32-chars-longer!!' }), ok.reply),
    ).toBe(true)
  })
})
