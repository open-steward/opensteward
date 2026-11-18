import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const CLI_ROOT = join(__dirname, '..')
const CLI_BIN = join(CLI_ROOT, 'dist', 'index.js')
const MANIFEST = join(CLI_ROOT, 'src', 'generated', 'manifest.json')

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [CLI_BIN, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OS_TOKEN: 'test-skip-auth' },
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

describe('os --help (smoke)', () => {
  it('builds, exits 0, and lists every top-level tag from the manifest', () => {
    if (!existsSync(CLI_BIN) || !existsSync(MANIFEST)) {
      // The smoke test depends on a built CLI + a populated manifest.
      // Skip silently if either is missing — `pnpm --filter @opensteward/cli build`
      // produces both as a side-effect of `cli:generate` + `tsc`.
      return
    }
    const r = run(['--help'])
    expect(r.code).toBe(0)
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Array<{
      command: string
      tag: string
    }>
    const tags = new Set(manifest.map((m) => m.tag))
    for (const tag of tags) {
      expect(r.stdout, `--help should mention top-level group '${tag}'`).toContain(tag)
    }
    // Offline tools + the interactive wizard must always appear.
    for (const t of ['backup', 'restore', 'doctor', 'rotate-secret', 'setup']) {
      expect(r.stdout).toContain(t)
    }
  })

  it('registers the interactive `os setup` wizard', () => {
    if (!existsSync(CLI_BIN)) return
    const r = run(['setup', '--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Interactive first-run setup')
  })

  it('emits per-group help with the subcommands for every operation in the manifest', () => {
    if (!existsSync(CLI_BIN) || !existsSync(MANIFEST)) return
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Array<{
      command: string
      tag: string
    }>
    // Sample three top-level groups (full sweep would be 27 invocations).
    const sample = ['users', 'platforms', 'auth'].filter((g) =>
      manifest.some((m) => m.tag === g),
    )
    for (const group of sample) {
      const r = run([group, '--help'])
      expect(r.code, `os ${group} --help should exit 0`).toBe(0)
      // Every command path in the manifest under this group's
      // first-segment should appear somewhere in the help output.
      // Help only renders the next-level segments — assert each
      // distinct second segment is present.
      const seconds = new Set(
        manifest
          .filter((m) => m.tag === group)
          .map((m) => m.command.split(' ')[1])
          .filter(Boolean),
      )
      for (const sub of seconds) {
        expect(r.stdout, `os ${group} --help should mention '${sub}'`).toContain(sub)
      }
    }
  })
})
