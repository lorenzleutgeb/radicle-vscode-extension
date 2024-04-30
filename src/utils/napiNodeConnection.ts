import * as vscode from 'vscode'
import { projects, ridAt } from 'radicle-napi'
import { patch, patches, project } from 'napi/dist'
import type { Patch, Project } from '../types/httpd'
import type { RID, RadicleNodeConnection, Result, ValidationOptions } from '../types/node'

export class NAPINode implements RadicleNodeConnection {
  public async validate(_options: ValidationOptions): Promise<boolean> {
    return await Promise.resolve(true)
  }

  public async getProject(rid: string): Promise<Result<Project>> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return await Promise.resolve({ data: project(rid) as Project })
  }

  public async fetchPatch(rid: RID, patchId: string): Promise<Result<Patch>> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    return await Promise.resolve({ data: patch(rid, patchId) })
  }

  public async fetchAllPatches(rid: RID): Promise<[Result<Patch[]>]> {
    return await Promise.resolve([{ data: patches(rid) }])
  }

  public async getCurrentProjectId(): Promise<Result<RID>> {
    return await Promise.resolve({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      data: ridAt(vscode.workspace.workspaceFolders![0]!.uri.fsPath) as RID,
    })
  }

  public async getAllProjects(): Promise<Result<Project[]>> {
    return await Promise.resolve({ data: projects() as Project[] })
  }
}
