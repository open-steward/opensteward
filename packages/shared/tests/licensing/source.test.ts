import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_LICENSE_FILE_BYTES,
  TOKEN_AS_FILE_PATH,
  readLicenseSource,
} from '../../src/licensing/source'

let dir = ''
let file = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lic-src-'))
  file = join(dir, 'license.key')
})
afterEach(() => {
  try {
    chmodSync(file, 0o600)
  } catch {
    // no file in this test
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('readLicenseSource', () => {
  it('the env token wins, and names the existing file it shadows (Review Focus #2)', () => {
    writeFileSync(file, 'v4.public.from-file')
    expect(readLicenseSource({ envToken: 'v4.public.from-env', filePath: file })).toEqual({
      kind: 'env',
      token: 'v4.public.from-env',
      shadowedFile: file,
    })
  })
  it('only a regular file is shadowed: a directory at the path is not reported (review m28)', () => {
    mkdirSync(file)
    expect(readLicenseSource({ envToken: 'v4.public.from-env', filePath: file })).toEqual({
      kind: 'env',
      token: 'v4.public.from-env',
    })
  })
  it('an env token with no file shadows nothing, and is trimmed', () => {
    expect(readLicenseSource({ envToken: ' v4.public.x \n', filePath: file })).toEqual({
      kind: 'env',
      token: 'v4.public.x',
    })
  })
  it('an empty or whitespace env value is unset: the file is read', () => {
    writeFileSync(file, 'v4.public.from-file\n')
    for (const envToken of ['', '   ', '\n']) {
      expect(readLicenseSource({ envToken, filePath: file })).toEqual({
        kind: 'file',
        path: file,
        token: 'v4.public.from-file',
      })
    }
  })
  it('a missing file, or a missing directory, is none: never an error', () => {
    expect(readLicenseSource({ filePath: file })).toEqual({ kind: 'none', path: file })
    const deep = join(dir, 'no-such-dir', 'license.key')
    expect(readLicenseSource({ filePath: deep })).toEqual({ kind: 'none', path: deep })
  })
  it('a path under a regular file (ENOTDIR) is none', () => {
    writeFileSync(file, 'x')
    expect(readLicenseSource({ filePath: join(file, 'license.key') })).toMatchObject({
      kind: 'none',
    })
  })
  it('a directory at the path is FILE_UNREADABLE', () => {
    mkdirSync(file)
    expect(readLicenseSource({ filePath: file })).toEqual({
      kind: 'error',
      path: file,
      reason: 'FILE_UNREADABLE',
    })
  })
  it.skipIf(process.getuid?.() === 0)(
    'a file this uid cannot read is FILE_UNREADABLE, never a throw (Review Focus #1)',
    () => {
      writeFileSync(file, 'v4.public.x')
      chmodSync(file, 0o000)
      expect(readLicenseSource({ filePath: file })).toEqual({
        kind: 'error',
        path: file,
        reason: 'FILE_UNREADABLE',
      })
    },
  )
  it('over 64 KiB is FILE_TOO_LARGE; whitespace only is FILE_EMPTY', () => {
    writeFileSync(file, 'x'.repeat(MAX_LICENSE_FILE_BYTES + 1))
    expect(readLicenseSource({ filePath: file })).toMatchObject({
      kind: 'error',
      reason: 'FILE_TOO_LARGE',
    })
    writeFileSync(file, ' \r\n\t ')
    expect(readLicenseSource({ filePath: file })).toMatchObject({
      kind: 'error',
      reason: 'FILE_EMPTY',
    })
  })
  it('strips a BOM and a \\r\\n ending, and follows a symlink (a Kubernetes ..data swap)', () => {
    mkdirSync(join(dir, '..data'))
    writeFileSync(join(dir, '..data', 'license.key'), '\uFEFFv4.public.abc\r\n')
    symlinkSync(join('..data', 'license.key'), file)
    expect(readLicenseSource({ filePath: file })).toEqual({
      kind: 'file',
      path: file,
      token: 'v4.public.abc',
    })
  })
  it('a token pasted where the path goes is never read or echoed: FILE_UNREADABLE under a fixed name', () => {
    // As loadLicenseConfig leaves it: path.resolve() of the token. Doctor's rule, on the last segment.
    const token = `v4.public.${'eyJhdWQiOiJvcGVuc3Rld2FyZCJ9'.repeat(16)}.eyJraWQiOiJkZXYxIn0`
    writeFileSync(join(dir, 'v4.public.short'), 'v4.public.short')
    for (const filePath of [
      join(dir, token),
      join(dir, 'v4.public.short'), // exists, and is still not read
      join(dir, 'x'.repeat(256)), // longer than any file name can be
    ]) {
      expect(readLicenseSource({ filePath }), filePath).toEqual({
        kind: 'error',
        path: TOKEN_AS_FILE_PATH,
        reason: 'FILE_UNREADABLE',
      })
      expect(readLicenseSource({ envToken: 'v4.public.from-env', filePath }), filePath).toEqual({
        kind: 'env',
        token: 'v4.public.from-env',
      })
    }
  })
  it('a token behind or in front of a file name is the token too: every segment is checked, as doctor does (review r8)', () => {
    const token = `v4.public.${'eyJhdWQiOiJvcGVuc3Rld2FyZCJ9'.repeat(16)}.eyJraWQiOiJkZXYxIn0`
    // A real file under the short one, so only the rule (not a missing file) keeps it from being read or
    // shadowed. The other two cannot exist (each segment is over NAME_MAX), and must not be stat'ed either.
    mkdirSync(join(dir, 'v4.public.short'))
    writeFileSync(join(dir, 'v4.public.short', 'license.key'), 'v4.public.from-file')
    for (const filePath of [
      join(dir, token, 'license.key'),
      join(dir, 'v4.public.short', 'license.key'),
      join(dir, 'x'.repeat(256), 'license.key'),
      `${dir}\\v4.public.short\\license.key`, // a Windows-style separator, as doctor splits it
    ]) {
      expect(readLicenseSource({ filePath }), filePath).toEqual({
        kind: 'error',
        path: TOKEN_AS_FILE_PATH,
        reason: 'FILE_UNREADABLE',
      })
      expect(readLicenseSource({ envToken: 'v4.public.from-env', filePath }), filePath).toEqual({
        kind: 'env',
        token: 'v4.public.from-env',
      })
    }
  })
  it('a dot or a long name elsewhere in an ordinary path is still a path', () => {
    const plain = join(dir, 'v4.public', 'license.key') // no trailing dot: not the PASETO prefix
    mkdirSync(join(dir, 'v4.public'))
    writeFileSync(plain, 'v4.public.from-file')
    expect(readLicenseSource({ filePath: plain })).toEqual({
      kind: 'file',
      path: plain,
      token: 'v4.public.from-file',
    })
  })
  it('a NUL byte in the path is an error source, not a throw', () => {
    expect(readLicenseSource({ filePath: '/tmp/a\0b' })).toMatchObject({
      kind: 'error',
      reason: 'FILE_UNREADABLE',
    })
  })
})
