/**
 * Fixture: the documented example of GET https://api.tapd.cn/label
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/label/query_label.html
 * Fields: id, name 标签名称, color 颜色ID (枚举值 [1,2,3,4]),
 * color_value 实际颜色值, created 创建时间, workspace_id 项目ID.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawTapdLabel,
} from '../../../../../../../src/verticals/projects/adapters/tapd/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

const DOC_LABEL: RawTapdLabel = {
  id: '1220358527000001547',
  workspace_id: '20358527',
  name: '啦啦',
  color: '4',
  creator: 'huanjinxie',
  modifier: '',
  created: '2022-09-25 21:37:44',
  modified: '2022-09-25 21:37:44',
  color_value: '#748096',
}

describe('tapd transformTag (documented /label LabelPool item)', () => {
  it('parses with TagSchema and maps every documented field', () => {
    const t = TagSchema.parse(transformTag(DOC_LABEL, '20358527'))
    expect(t).toEqual({
      // Scoped so getTag can send the required workspace_id.
      id: '20358527:1220358527000001547',
      externalId: '1220358527000001547',
      workspaceId: '20358527',
      name: '啦啦',
      color: '#748096',
      platform: 'tapd',
      metadata: {
        colorId: '4',
        creator: 'huanjinxie',
        createdAt: '2022-09-25T21:37:44.000Z',
      },
      raw: DOC_LABEL,
    })
  })

  it('does not fall back to the colour id when color_value is absent', () => {
    const { color_value: _cv, ...noValue } = DOC_LABEL
    const t = TagSchema.parse(transformTag(noValue as RawTapdLabel, '20358527'))
    expect(t.color).toBeUndefined()
    expect(t.metadata['colorId']).toBe('4')
  })

  it('throws instead of inventing a name', () => {
    const { name: _n, ...noName } = DOC_LABEL
    expect(() => transformTag(noName as RawTapdLabel, '20358527')).toThrow(/name/)
  })
})
