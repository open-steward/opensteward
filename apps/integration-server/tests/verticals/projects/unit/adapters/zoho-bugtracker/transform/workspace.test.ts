import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawZohoBugtrackerPortal,
} from '../../../../../../../src/verticals/projects/adapters/zoho-bugtracker/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('zoho-bugtracker transformWorkspace', () => {
  const raw: RawZohoBugtrackerPortal = {
    id: 3001,
    id_string: 'portal-3001',
    name: 'Acme Portal',
    company_name: 'Acme Industries',
    website_url: 'https://acme.example.com',
    time_zone: 'America/New_York',
    date_format: 'MM-dd-yyyy',
    gmt_time_zone: 'GMT -5:00',
    role: 'owner',
    default: true,
    project_count: { template: 2, archived: 5, active: 10 },
  }

  it('uses id_string as id when present', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('portal-3001')
    expect(result.externalId).toBe('portal-3001')
  })

  it('falls back to string of numeric id when id_string absent', () => {
    const result = transformWorkspace({ ...raw, id_string: undefined })
    expect(result.id).toBe('3001')
  })

  it('maps name from name field', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Portal')
  })

  it('falls back to company_name when name absent', () => {
    const result = transformWorkspace({ ...raw, name: undefined })
    expect(result.name).toBe('Acme Industries')
  })

  it('name is empty string when both name and company_name absent', () => {
    const result = transformWorkspace({ ...raw, name: undefined, company_name: undefined })
    expect(result.name).toBe('')
  })

  it('platform is zoho-bugtracker', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('zoho-bugtracker')
  })

  it('metadata includes companyName, timeZone, role', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.companyName).toBe('Acme Industries')
    expect(result.metadata.timeZone).toBe('America/New_York')
    expect(result.metadata.role).toBe('owner')
  })

  it('metadata includes gmtTimeZone and isDefault', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.gmtTimeZone).toBe('GMT -5:00')
    expect(result.metadata.isDefault).toBe('true')
  })

  it('metadata includes activeProjects and archivedProjects counts', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.activeProjects).toBe('10')
    expect(result.metadata.archivedProjects).toBe('5')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
