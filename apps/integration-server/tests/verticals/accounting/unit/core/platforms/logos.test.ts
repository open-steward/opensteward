import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'node:fs/promises'
import { getLogo, clearLogoCache } from '../../../../../../src/verticals/accounting/platforms/logos'

const mockReadFile = readFile as ReturnType<typeof vi.fn>

beforeEach(() => {
  clearLogoCache()
  mockReadFile.mockReset()
})

describe('getLogo', () => {
  it('returns base64 string when file exists', async () => {
    const svgContent = Buffer.from('<svg/>')
    mockReadFile.mockResolvedValueOnce(svgContent)
    const result = await getLogo('fortnox')
    expect(result).toBe(svgContent.toString('base64'))
  })

  it('returns null on ENOENT', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValueOnce(err)
    const result = await getLogo('nonexistent')
    expect(result).toBeNull()
  })

  it('caches result — readFile called only once for same slug', async () => {
    const svgContent = Buffer.from('<svg/>')
    mockReadFile.mockResolvedValueOnce(svgContent)
    await getLogo('fortnox')
    await getLogo('fortnox')
    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })

  it('caches null result — readFile called only once for missing slug', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValueOnce(err)
    await getLogo('missing')
    await getLogo('missing')
    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })
})
