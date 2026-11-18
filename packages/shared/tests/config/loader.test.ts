import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadConfig } from '../../src/config/loader'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'config-loader-test-'))
}

describe('loadConfig', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when config file does not exist', () => {
    const result = loadConfig(
      {
        server: { port: 3000, host: '0.0.0.0' },
        store: { path: 'default.db', secret: 'env-secret' },
      } as any,
      '/tmp/nonexistent-config-file.yml',
    )
    expect(result.store.secret).toBe('env-secret')
    expect(result.store.path).toBe('default.db')
  })

  it('deep-merges YAML over defaults — partial store keeps default secret', () => {
    dir = makeTmpDir()
    const configPath = join(dir, 'config.yml')
    writeFileSync(configPath, 'store:\n  path: "./yaml-overridden.db"\n')

    const result = loadConfig(
      {
        server: { port: 3000, host: '0.0.0.0' },
        store: { path: 'default.db', secret: 'env-secret' },
      } as any,
      configPath,
    )
    expect(result.store.path).toBe('./yaml-overridden.db')
    // The secret must NOT be lost when YAML provides only path
    expect(result.store.secret).toBe('env-secret')
  })

  it('YAML scalar overrides default scalar', () => {
    dir = makeTmpDir()
    const configPath = join(dir, 'config.yml')
    writeFileSync(configPath, 'server:\n  port: 9999\n')

    const result = loadConfig(
      {
        server: { port: 3000, host: '0.0.0.0' },
        store: { path: 'default.db', secret: 'env-secret' },
      } as any,
      configPath,
    )
    expect(result.server.port).toBe(9999)
    expect(result.server.host).toBe('0.0.0.0')
    expect(result.store.secret).toBe('env-secret')
  })

  it('YAML arrays replace default arrays (no concat)', () => {
    dir = makeTmpDir()
    const configPath = join(dir, 'config.yml')
    writeFileSync(configPath, 'tags:\n  - prod\n  - eu\n')

    const result = loadConfig(
      {
        server: { port: 3000, host: '0.0.0.0' },
        tags: ['default'],
      } as any,
      configPath,
    )
    expect((result as any).tags).toEqual(['prod', 'eu'])
  })
})
