import type { XOR } from 'ts-xor'
import type { Patch, Project } from './httpd'

export type Result<Data> = XOR<{ data: Data }, { error: Error }>
export type RID = `rad:${string}`
export interface ValidationOptions {
  minimizeUserNotifications: boolean
}

export interface RadicleNodeConnection {
  validate(options: ValidationOptions): Promise<boolean>
  getAllProjects(): Promise<Result<Project[]>>
  getProject(id: string): Promise<Result<Project>>
  getCurrentProjectId(): Promise<Result<RID>>
  fetchAllPatches(rid: RID): Promise<[Result<Patch[]>]>
  fetchPatch(rid: RID, patchId: string): Promise<Result<Patch>>
}
