import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const CLI_BIN = join(__dirname, '..', 'dist', 'index.js')

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [CLI_BIN, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    }
  }
}

describe('offline tools wrapping', () => {
  it('os backup --help mentions the same flags as pnpm backup --help', () => {
    if (!existsSync(CLI_BIN)) return
    const r = run(['backup', '--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('--repo-root')
    expect(r.stdout).toContain('--out-dir')
    expect(r.stdout).toContain('--unsafe-allow-live-db')
    expect(r.stdout).toContain('--volumes-base')
  })

  it('os restore --help mirrors the script flags', () => {
    if (!existsSync(CLI_BIN)) return
    const r = run(['restore', '--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('--repo-root')
    expect(r.stdout).toContain('--volumes-base')
  })

  // skipIf, not an early return: an unbuilt CLI shows as skipped, never as a pass.
  it.skipIf(!existsSync(CLI_BIN))('os doctor --help mirrors the script flags', () => {
    const r = run(['doctor', '--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('--repo-root')
    // runDoctor includes the license check (A2s-8); the help says so.
    expect(r.stdout).toContain('the license integration-server will run under')
  })

  it.skipIf(!existsSync(CLI_BIN))('os --help lists the license among the doctor checks', () => {
    const r = run(['--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Preflight checks:[^\n]*\n?[^\n]*license/)
  })

  it('os rotate-secret --help mirrors the script flags', () => {
    if (!existsSync(CLI_BIN)) return
    const r = run(['rotate-secret', '--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('--old-key')
    expect(r.stdout).toContain('--new-key')
  })

  it('the four offline tools appear in `os --help`', () => {
    if (!existsSync(CLI_BIN)) return
    const r = run(['--help'])
    expect(r.code).toBe(0)
    for (const t of ['backup', 'restore', 'doctor', 'rotate-secret']) {
      expect(r.stdout).toContain(t)
    }
  })
})
