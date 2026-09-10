export interface PageTarget { tabId: number; windowId: number; address: string; origin: string; pathname: string; title: string }
export interface BoundProject { id: number; name: string }
export interface PlatformScope { origin: string; prefix: string }
export interface PlatformRule extends PlatformScope { id: string; name?: string; authorized: boolean; projects: BoundProject[] }
export interface PlatformContext {
  page: PageTarget | null
  status: 'unsupported' | 'unauthorized' | 'unbound' | 'ambiguous' | 'bound'
  rule: PlatformRule | null
  selected: BoundProject | null
}
export const PLATFORM_STORAGE_PREFIX = 'asynctest.platforms.v1:'
export type PlatformCommand =
  | { type: 'platform.context'; windowId: number }
  | { type: 'platform.authorize'; target: PageTarget; scope: PlatformScope; name?: string }
  | { type: 'platform.rename'; target: PageTarget; ruleId: string; name: string }
  | { type: 'platform.bind'; target: PageTarget; scope: PlatformScope; project: BoundProject }
  | { type: 'platform.select'; target: PageTarget; ruleId: string; projectId: number }
  | { type: 'platform.unbind'; target: PageTarget; ruleId: string; projectId: number }
  | { type: 'platform.projects'; search: string; page: number }
