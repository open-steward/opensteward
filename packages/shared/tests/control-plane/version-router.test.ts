/**
 * Tests for createVersionRouter — the shared `/version` plugin every
 * service mounts next to `/health`. Verifies:
 *
 * 1. Constant fields (`name`, `version`) come from the caller.
 * 2. `gitSha` + `buildTime` are pulled from process.env at request time
 *    (NOT cached at module load) so docker-compose ARG → ENV plumbing
 *    works without a re-import.
 * 3. Missing env vars default to the literal string `"dev"` — the local
 *    dev experience operators see when they run `pnpm dev` without
 *    setting GIT_SHA / BUILD_TIME.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createVersionRouter,
  readBuildTime,
  readGitSha,
  readRelease,
} from '../../src/control-plane/version-router'

describe('createVersionRouter', () => {
  let app: FastifyInstance
  let savedSha: string | undefined
  let savedBuildTime: string | undefined
  let savedRelease: string | undefined

  beforeEach(() => {
    savedSha = process.env['GIT_SHA']
    savedBuildTime = process.env['BUILD_TIME']
    savedRelease = process.env['OPENSTEWARD_RELEASE']
    delete process.env['GIT_SHA']
    delete process.env['BUILD_TIME']
    process.env['OPENSTEWARD_RELEASE'] = '9.8.7'
    app = Fastify()
  })

  afterEach(async () => {
    if (savedSha === undefined) delete process.env['GIT_SHA']
    else process.env['GIT_SHA'] = savedSha
    if (savedBuildTime === undefined) delete process.env['BUILD_TIME']
    else process.env['BUILD_TIME'] = savedBuildTime
    if (savedRelease === undefined) delete process.env['OPENSTEWARD_RELEASE']
    else process.env['OPENSTEWARD_RELEASE'] = savedRelease
    await app.close()
  })

  it('defaults gitSha and buildTime to "dev" when env is unset', async () => {
    await app.register(createVersionRouter({ name: 'svc', version: '1.2.3' }))
    const res = await app.inject({ method: 'GET', url: '/version' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      name: 'svc',
      version: '1.2.3',
      release: '9.8.7',
      gitSha: 'dev',
      buildTime: 'dev',
    })
  })

  it('reflects process.env at request time, not registration time', async () => {
    await app.register(createVersionRouter({ name: 'svc', version: '0.0.1' }))
    process.env['GIT_SHA'] = 'abc1234'
    process.env['BUILD_TIME'] = '2026-05-27T12:00:00Z'
    const res = await app.inject({ method: 'GET', url: '/version' })
    expect(res.json()).toMatchObject({
      gitSha: 'abc1234',
      buildTime: '2026-05-27T12:00:00Z',
    })
  })

  it('treats empty-string env values as unset and falls back to "dev"', async () => {
    process.env['GIT_SHA'] = ''
    process.env['BUILD_TIME'] = ''
    await app.register(createVersionRouter({ name: 'svc', version: '1.0.0' }))
    const res = await app.inject({ method: 'GET', url: '/version' })
    expect(res.json()).toMatchObject({ gitSha: 'dev', buildTime: 'dev' })
  })

  it('exports the readers as standalone helpers for non-Fastify callers', () => {
    process.env['GIT_SHA'] = 'deadbeef'
    expect(readGitSha()).toBe('deadbeef')
    delete process.env['GIT_SHA']
    expect(readGitSha()).toBe('dev')

    process.env['BUILD_TIME'] = '2026-01-01T00:00:00Z'
    expect(readBuildTime()).toBe('2026-01-01T00:00:00Z')
    delete process.env['BUILD_TIME']
    expect(readBuildTime()).toBe('dev')
  })
})

/**
 * `release` — the OpenSteward release a build belongs to. Images carry the
 * repo's VERSION file at /app/VERSION (the working directory); `pnpm dev`
 * runs from apps/<app> and finds the repo root's copy by walking up.
 */
describe('readRelease', () => {
  let root: string
  let savedRelease: string | undefined

  beforeEach(() => {
    savedRelease = process.env['OPENSTEWARD_RELEASE']
    delete process.env['OPENSTEWARD_RELEASE']
    root = mkdtempSync(join(tmpdir(), 'os-release-'))
  })

  afterEach(() => {
    if (savedRelease === undefined) delete process.env['OPENSTEWARD_RELEASE']
    else process.env['OPENSTEWARD_RELEASE'] = savedRelease
    rmSync(root, { recursive: true, force: true })
  })

  it('reads VERSION in the start directory, trimmed', () => {
    writeFileSync(join(root, 'VERSION'), '0.4.2\n')
    expect(readRelease(root)).toBe('0.4.2')
  })

  it('walks up to the nearest VERSION, as a dev server in apps/<app> does', () => {
    writeFileSync(join(root, 'VERSION'), '1.2.0-rc.1')
    const app = join(root, 'apps', 'admin')
    mkdirSync(app, { recursive: true })
    expect(readRelease(app)).toBe('1.2.0-rc.1')
  })

  it('skips a VERSION file that does not hold a version', () => {
    writeFileSync(join(root, 'VERSION'), '0.3.0')
    const nested = join(root, 'vendor', 'thing')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(root, 'vendor', 'VERSION'), 'see CHANGELOG\n')
    expect(readRelease(nested)).toBe('0.3.0')
  })

  it('prefers OPENSTEWARD_RELEASE, read on every call', () => {
    writeFileSync(join(root, 'VERSION'), '0.4.2')
    expect(readRelease(root)).toBe('0.4.2')
    process.env['OPENSTEWARD_RELEASE'] = '2.0.0'
    expect(readRelease(root)).toBe('2.0.0')
  })

  it('answers "unknown" when no VERSION exists anywhere above', () => {
    // A temp dir's ancestors (/tmp, /private, /) hold no VERSION file.
    expect(readRelease(root)).toBe('unknown')
  })
})
