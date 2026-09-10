import { ApiError, AsyncTestClient, object } from './client'

export interface JoinedProject { id: number; name: string; role: number }
export interface ProjectPage { count: number; projects: JoinedProject[]; page: number }

export async function joinedProjects(base: string, token: string, search = '', page = 1): Promise<ProjectPage> {
  const query = new URLSearchParams({ group: 'joined', search: search.slice(0, 100), page: String(page), page_size: '50' })
  const result = object(await new AsyncTestClient(base, token).request(`/team/projects/?${query}`))
  if (!Number.isSafeInteger(result.count) || Number(result.count) < 0 || !Array.isArray(result.results)) throw new ApiError('protocol', '无法读取已加入的项目，请确认服务版本。')
  const projects = result.results.map(value => {
    const row = object(value)
    if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || typeof row.name !== 'string' || ![0, 1, 2].includes(Number(row.role)) || row.role === null) throw new ApiError('protocol', '项目列表格式不正确。')
    return { id: Number(row.id), name: row.name, role: Number(row.role) }
  })
  return { count: Number(result.count), projects, page }
}

export async function requireJoinedProject(base: string, token: string, project: { id: number; name: string }): Promise<JoinedProject> {
  for (let page = 1; page <= 20; page++) {
    const result = await joinedProjects(base, token, project.name, page)
    const match = result.projects.find(row => row.id === project.id)
    if (match) return match
    if (result.projects.length === 0 || page * 50 >= result.count) break
  }
  throw new ApiError('permission', '该项目已不可用或你已不在项目中，请重新选择。')
}
