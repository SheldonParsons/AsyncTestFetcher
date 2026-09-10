import { ApiError, object } from '../api/asynctest/client'
import type { PageTarget, PlatformScope } from './contracts'
import type { PlatformManager } from './manager'

export async function handlePlatformMessage(manager: PlatformManager, message: Record<string, unknown>) {
  if (message.type === 'platform.context') {
    if (!Number.isInteger(message.windowId)) throw new ApiError('input', '缺少当前浏览器窗口。')
    return manager.context(Number(message.windowId))
  }
  if (message.type === 'platform.projects') {
    const page = Number(message.page)
    if (!Number.isInteger(page) || page < 1 || page > 10000 || typeof message.search !== 'string') throw new ApiError('input', '项目查询参数不正确。')
    return manager.projects(message.search, page)
  }
  const value = object(message.target)
  if (!Number.isInteger(value.tabId) || !Number.isInteger(value.windowId) || typeof value.address !== 'string') throw new ApiError('input', '当前页面信息不完整。')
  const target = value as unknown as PageTarget
  if (message.type === 'platform.rename') {
    if (typeof message.ruleId !== 'string' || typeof message.name !== 'string') throw new ApiError('input', '平台名称信息不完整。')
    return manager.rename(target, message.ruleId, message.name)
  }
  if (message.type === 'platform.select' || message.type === 'platform.unbind') {
    if (typeof message.ruleId !== 'string' || !Number.isSafeInteger(message.projectId) || Number(message.projectId) <= 0) throw new ApiError('input', '绑定信息不完整。')
    return message.type === 'platform.select' ? manager.select(target, message.ruleId, Number(message.projectId)) : manager.unbind(target, message.ruleId, Number(message.projectId))
  }
  const scope = object(message.scope)
  if (typeof scope.origin !== 'string' || typeof scope.prefix !== 'string') throw new ApiError('input', '授权范围不完整。')
  const input = scope as unknown as PlatformScope
  if (message.type === 'platform.authorize') {
    if (message.name !== undefined && typeof message.name !== 'string') throw new ApiError('input', '平台名称格式不正确。')
    return manager.authorize(target, input, message.name as string | undefined)
  }
  if (message.type === 'platform.bind') {
    const project = object(message.project)
    if (!Number.isSafeInteger(project.id) || Number(project.id) <= 0 || typeof project.name !== 'string') throw new ApiError('input', '请先选择一个已加入的项目。')
    return manager.bind(target, input, { id: Number(project.id), name: project.name })
  }
  throw new ApiError('input', '未知的平台操作。')
}
