/**
 * A platform must not advertise an OAuth redirect flow it cannot perform.
 *
 * `connect-router.ts` branches on `auth_type`: only `'oauth2'` is treated as a
 * browser redirect flow, and everything else is offered to the customer as a
 * credential form via `credentialFields()`. So a platform marked `'oauth2'`
 * whose `exchangeCode()` does nothing but throw sends the customer down a path
 * that cannot complete — they get the adapter's placeholder authorize URL, and
 * the credential form it does implement is never shown.
 *
 * This is the inconsistency class the check forbids: an adapter whose own
 * auth.ts documents a non-redirect flow (e.g. "Access Financials does NOT use
 * a standard OAuth2 authorization-code flow") while metadata declares
 * `auth_type: 'oauth2'`, or one documented in its own header as
 * client-credentials, which is `oauth2_cc` and not a redirect flow.
 *
 * 29 other adapters have an equally throwing `exchangeCode` and declare
 * `api_key` correctly, so this is a narrow check on a real inconsistency
 * rather than a stylistic one.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const VERTICALS_DIR = join(__dirname, '../../src/verticals')

/**
 * An exchangeCode whose body, comments aside, is nothing but a throw: either
 * the exported function in auth.ts or the method on the class in index.ts.
 * The auth.ts form alone missed payments/gocardless and payments/mercado-pago,
 * which throw in the class method.
 */
function exchangeCodeOnlyThrows(adapterDir: string): boolean {
  const bodies: string[] = []
  const authFile = join(adapterDir, 'auth.ts')
  if (existsSync(authFile)) {
    const b = readFileSync(authFile, 'utf8').match(
      /export async function exchangeCode\([^)]*\)[^{]*\{([\s\S]{0,400}?)\n\}/,
    )?.[1]
    if (b) bodies.push(b)
  }
  const indexFile = join(adapterDir, 'index.ts')
  if (existsSync(indexFile)) {
    const src = readFileSync(indexFile, 'utf8')
    // An adapter that collects oauthFields at authorize time is exchanged
    // through exchangeCodeWithInputs (auth-router), so a throwing plain
    // exchangeCode is unreachable there, not a broken flow (tray-commerce).
    if (/\n {2}oauthFields\(/.test(src) && /\n {2}async exchangeCodeWithInputs\(/.test(src)) {
      return false
    }
    const b = src.match(/\n {2}async exchangeCode\([^)]*\)[^{]*\{([\s\S]{0,400}?)\n {2}\}/)?.[1]
    if (b) bodies.push(b)
  }
  return bodies.some((b) => /^throw /.test(b.replace(/\/\/.*$/gm, '').trim()))
}

/**
 * Adapters whose exchangeCode body is nothing but a throw. `unsupported`
 * marks a platform whose metadata entry refuses new connections, so its
 * redirect flow can never be started.
 */
function adaptersThatCannotExchangeCode(): Array<{
  key: string
  authType?: string
  unsupported: boolean
}> {
  const out: Array<{ key: string; authType?: string; unsupported: boolean }> = []
  for (const vertical of readdirSync(VERTICALS_DIR)) {
    const metaFile = join(VERTICALS_DIR, vertical, 'platforms/metadata.ts')
    const adaptersDir = join(VERTICALS_DIR, vertical, 'adapters')
    if (!existsSync(metaFile) || !existsSync(adaptersDir)) continue
    const meta = readFileSync(metaFile, 'utf8')
    for (const slug of readdirSync(adaptersDir)) {
      if (!exchangeCodeOnlyThrows(join(adaptersDir, slug))) continue
      const i = meta.indexOf(`slug: '${slug}'`)
      if (i === -1) continue
      const next = meta.indexOf("slug: '", i + 1)
      const entry = meta.slice(i, next === -1 ? undefined : next)
      out.push({
        key: `${vertical}/${slug}`,
        authType: entry.match(/auth_type:\s*'([a-z0-9_]+)'/)?.[1],
        unsupported: /\n\s+unsupported:\s*\{/.test(entry),
      })
    }
  }
  return out
}

/** Labelled 'oauth2' and still offered for new connections. */
function connectableOAuth2WithoutCodeFlow(): string[] {
  return adaptersThatCannotExchangeCode()
    .filter((a) => a.authType === 'oauth2' && !a.unsupported)
    .map((a) => a.key)
}

describe('auth_type matches what the adapter can actually do', () => {
  it('marks no redirect-flow platform whose code exchange only throws', () => {
    // The 46-entry known-offender list that used to sit here was emptied by
    // the OAuth rebuilds; there is no baseline left.
    expect(connectableOAuth2WithoutCodeFlow()).toEqual([])
  })

  it('reads the class method in index.ts too (payments/gocardless throws there)', () => {
    const keys = adaptersThatCannotExchangeCode().map((a) => a.key)
    expect(keys).toContain('payments/gocardless')
    expect(keys).toContain('payments/mercado-pago')
  })

  it('does not flag an adapter exchanged through exchangeCodeWithInputs', () => {
    const keys = adaptersThatCannotExchangeCode().map((a) => a.key)
    expect(keys).not.toContain('ecommerce/tray-commerce')
  })

  it('does not count a platform marked unsupported, whose connect is refused', () => {
    const hiver = adaptersThatCannotExchangeCode().find((a) => a.key === 'customer-support/hiver')
    expect(hiver).toMatchObject({ authType: 'oauth2', unsupported: true })
    expect(connectableOAuth2WithoutCodeFlow()).not.toContain('customer-support/hiver')
  })

  it('still finds the adapters it is meant to inspect', () => {
    // Guards the parser: if a refactor changed the shape of these files this
    // test would silently pass by inspecting nothing.
    expect(adaptersThatCannotExchangeCode().length).toBeGreaterThan(20)
  })
})
