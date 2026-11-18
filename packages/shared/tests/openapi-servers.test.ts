import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPENAPI_SERVERS,
  SERVER_URL_TEMPLATE,
  buildServersBlock,
  mergeServerVariables,
  validateServerVariables,
} from '../src/openapi-servers'

describe('mergeServerVariables', () => {
  it('returns compiled defaults when no sources provided', () => {
    const out = mergeServerVariables()
    expect(out.scheme.default).toBe('http')
    expect(out.host.default).toBe('localhost')
    expect(out.port.default).toBe('3010')
    expect(out.version.default).toBe('v1')
    expect(out.scheme.enum).toEqual(['http', 'https'])
  })

  it('ignores null and undefined sources', () => {
    const out = mergeServerVariables(null, undefined)
    expect(out.host.default).toBe('localhost')
  })

  it('overrides default and enum per-variable', () => {
    const out = mergeServerVariables({
      host: { default: 'oi.acme.com', enum: ['oi.acme.com', 'oi-staging.acme.com'] },
    })
    expect(out.host.default).toBe('oi.acme.com')
    expect(out.host.enum).toEqual(['oi.acme.com', 'oi-staging.acme.com'])
    // Untouched variables keep their defaults.
    expect(out.scheme.default).toBe('http')
  })

  it('merges partial overrides — default-only and enum-only compose', () => {
    const out = mergeServerVariables(
      { host: { default: 'oi.acme.com' } },
      { host: { enum: ['oi.acme.com', 'oi-staging.acme.com'] } },
    )
    expect(out.host.default).toBe('oi.acme.com')
    expect(out.host.enum).toEqual(['oi.acme.com', 'oi-staging.acme.com'])
  })

  it('later source wins per-field (admin-DB > config.yml > defaults)', () => {
    const out = mergeServerVariables(
      { scheme: { default: 'http' } }, // compiled
      { scheme: { default: 'https', enum: ['https'] } }, // config.yml
      { scheme: { enum: ['https', 'http'] } }, // admin-DB (enum-only override)
    )
    expect(out.scheme.default).toBe('https')
    expect(out.scheme.enum).toEqual(['https', 'http'])
  })

  it('dedupes enum entries', () => {
    const out = mergeServerVariables({
      port: { default: '3010', enum: ['3010', '3010', '443'] },
    })
    expect(out.port.enum).toEqual(['3010', '443'])
  })

  it('inherits default when enum-only override leaves it set; validation catches the mismatch', () => {
    // Partial enum override that drops the inherited default is operator
    // ambiguity — did they mean to remove localhost or just forget to set
    // default? mergeServerVariables doesn't auto-fix; buildServersBlock
    // surfaces the error so the operator sets both explicitly.
    const merged = mergeServerVariables({ host: { enum: ['oi.acme.com'] } })
    expect(merged.host.default).toBe('localhost') // inherited
    expect(merged.host.enum).toEqual(['oi.acme.com'])
    expect(() => validateServerVariables(merged)).toThrow(/default .* is not in enum/)
  })
})

describe('validateServerVariables', () => {
  it('passes for the compiled defaults', () => {
    expect(() => validateServerVariables(DEFAULT_OPENAPI_SERVERS)).not.toThrow()
  })

  it('rejects default not in enum', () => {
    expect(() =>
      validateServerVariables({
        host: { default: 'oi.acme.com', enum: ['oi-staging.acme.com'] },
      }),
    ).toThrow(/default .* is not in enum/)
  })

  it('rejects duplicate enum values', () => {
    expect(() =>
      validateServerVariables({
        port: { default: '3010', enum: ['3010', '3010'] },
      }),
    ).toThrow(/duplicate value/)
  })

  it('rejects empty-string enum entries', () => {
    expect(() =>
      validateServerVariables({
        scheme: { default: 'http', enum: ['http', ''] },
      }),
    ).toThrow(/non-empty/)
  })

  it('rejects non-string default', () => {
    expect(() =>
      validateServerVariables({
        // @ts-expect-error testing runtime guard against bad operator input
        port: { default: 3010, enum: ['3010'] },
      }),
    ).toThrow(/must be a string/)
  })

  it('skips variables that are absent', () => {
    expect(() =>
      validateServerVariables({ host: { default: 'oi.acme.com', enum: ['oi.acme.com'] } }),
    ).not.toThrow()
  })
})

describe('buildServersBlock', () => {
  it('emits the single templated entry with defaults', () => {
    const out = buildServersBlock()
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe(SERVER_URL_TEMPLATE)
    expect(out[0].description).toBe('OpenSteward deployment')
    expect(out[0].variables.scheme?.default).toBe('http')
    expect(out[0].variables.host?.default).toBe('localhost')
    expect(out[0].variables.port?.default).toBe('3010')
    expect(out[0].variables.version?.default).toBe('v1')
  })

  it('emits the unversioned variant for per-path-item overrides', () => {
    const out = buildServersBlock(undefined, { variant: 'unversioned' })
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('{scheme}://{host}:{port}')
    expect(out[0].variables.scheme?.default).toBe('http')
    expect(out[0].variables.host?.default).toBe('localhost')
    expect(out[0].variables.port?.default).toBe('3010')
    // No `version` variable on the unversioned override.
    expect(out[0].variables.version).toBeUndefined()
  })

  it('flows operator overrides into the emitted block', () => {
    const out = buildServersBlock({
      host: { default: 'oi.acme.com', enum: ['oi.acme.com', 'oi-staging.acme.com'] },
      port: { default: '443', enum: ['443'] },
    })
    expect(out[0].variables.host?.default).toBe('oi.acme.com')
    expect(out[0].variables.host?.enum).toEqual(['oi.acme.com', 'oi-staging.acme.com'])
    expect(out[0].variables.port?.default).toBe('443')
  })

  it('throws on inconsistent operator overrides', () => {
    expect(() =>
      buildServersBlock({
        host: { default: 'oi.acme.com', enum: ['oi-staging.acme.com'] },
      }),
    ).toThrow(/default .* is not in enum/)
  })
})

describe('the live-only variant', () => {
  it('shares the root URL template but says what it omits', () => {
    // Same template on purpose — the override exists for what it EXCLUDES, not
    // for a different address. Without a distinct description it reads as a
    // pointless duplicate of the global server.
    const [root] = buildServersBlock()
    const [liveOnly] = buildServersBlock(undefined, { variant: 'live-only' })
    expect(liveOnly.url).toBe(root.url)
    expect(liveOnly.description).not.toBe(root.description)
    expect(liveOnly.description).toMatch(/sandbox/i)
  })

  it('keeps the version variable, unlike the unversioned override', () => {
    const [liveOnly] = buildServersBlock(undefined, { variant: 'live-only' })
    const [unversioned] = buildServersBlock(undefined, { variant: 'unversioned' })
    expect(liveOnly.variables?.version).toBeDefined()
    expect(unversioned.variables?.version).toBeUndefined()
  })

  it('honours operator host/port overrides like every other variant', () => {
    // The docs-server rebuilds these per request so admin edits reach them.
    const [liveOnly] = buildServersBlock(
      { host: { default: 'api.acme.com', enum: ['api.acme.com'] } },
      { variant: 'live-only' },
    )
    expect(liveOnly.variables?.host?.default).toBe('api.acme.com')
  })
})
