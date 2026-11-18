/** project.project rows; fields from addons/project/models/project_project.py, 19.0 (and 14.0–18.0). */
import { describe, expect, it } from 'vitest'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'
import { transformProject } from '../../../../../../../src/verticals/projects/adapters/odoo-project/transform/project'

const base = {
  id: 4,
  name: 'Office Design',
  description: '<p>Plan the <b>new</b> office &amp; move.</p>',
  active: true,
  partner_id: [9, 'Deco Addict'] as [number, string],
  company_id: [1, 'YourCompany'] as [number, string],
  user_id: [2, 'Mitchell Admin'] as [number, string],
  date_start: '2026-01-05',
  date: '2026-03-31',
  tag_ids: [3, 5],
  privacy_visibility: 'portal',
  last_update_status: 'on_track',
  create_date: '2026-01-01 08:00:00',
  write_date: '2026-01-02 09:30:00',
}

describe('odoo-project transformProject', () => {
  it('maps a 19.0 project', () => {
    const p = ProjectSchema.parse(transformProject(base))
    expect(p).toMatchObject({
      id: '4',
      externalId: '4',
      workspaceId: '1',
      name: 'Office Design',
      description: 'Plan the new office & move.',
      status: 'active',
      ownerId: '2',
      startDate: '2026-01-05T00:00:00.000Z',
      endDate: '2026-03-31T00:00:00.000Z',
      createdAt: '2026-01-01T08:00:00.000Z',
      updatedAt: '2026-01-02T09:30:00.000Z',
      platform: 'odoo-project',
    })
    expect(p.metadata).toEqual({
      customerId: '9',
      lastUpdateStatus: 'on_track',
      privacyVisibility: 'portal',
      tagIds: '3,5',
    })
  })

  it.each([
    ['on_hold', 'on_hold'],
    ['done', 'completed'],
    ['at_risk', 'active'],
    ['off_track', 'active'],
    ['to_define', 'active'],
  ])('last_update_status %s is %s', (status, expected) => {
    expect(
      ProjectSchema.parse(transformProject({ ...base, last_update_status: status })).status,
    ).toBe(expected)
  })

  it('an archived project is archived whatever its status update says', () => {
    const p = ProjectSchema.parse(
      transformProject({ ...base, active: false, last_update_status: 'done' }),
    )
    expect(p.status).toBe('archived')
  })

  it('tolerates the 14.0 field set and empty values', () => {
    // 14.0 has no tag_ids and no last_update_status; empty fields read as false.
    const p = ProjectSchema.parse(
      transformProject({
        id: 7,
        name: 'Internal',
        description: false,
        active: true,
        partner_id: false,
        company_id: [1, 'YourCompany'],
        user_id: false,
        date_start: false,
        date: false,
        privacy_visibility: 'employees',
        create_date: '2021-01-01 00:00:00',
        write_date: false,
      }),
    )
    expect(p).toMatchObject({ id: '7', workspaceId: '1', status: 'active' })
    expect(p.description).toBeUndefined()
    expect(p.ownerId).toBeUndefined()
    expect(p.startDate).toBeUndefined()
    expect(p.updatedAt).toBeUndefined()
    expect(p.metadata).toEqual({ privacyVisibility: 'employees' })
  })

  it('a 17.0+ project with no company has an empty workspace', () => {
    const p = ProjectSchema.parse(transformProject({ ...base, company_id: false }))
    expect(p.workspaceId).toBe('')
  })

  it('a row with only an id still parses', () => {
    const p = ProjectSchema.parse(transformProject({ id: 1 }))
    expect(p).toMatchObject({ id: '1', name: '', status: 'active', workspaceId: '' })
  })
})
