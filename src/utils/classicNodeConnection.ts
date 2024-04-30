import { validateHttpdConnection } from 'src/ux'
import { fetchFromHttpd, memoizedGetCurrentProjectId } from '../helpers'
import type { Patch, Project } from '../types/httpd'
import type { RID, RadicleNodeConnection, Result, ValidationOptions } from '../types/node'

export class ClassicNode implements RadicleNodeConnection {
  public async validate(options: ValidationOptions): Promise<boolean> {
    return await validateHttpdConnection(options)
  }

  public async getProject(rid: RID): Promise<Result<Project>> {
    return await fetchFromHttpd(`/projects/${rid}`)
  }

  public async fetchPatch(rid: RID, patchId: string): Promise<Result<Patch>> {
    return await fetchFromHttpd(`/projects/${rid}/patches/${patchId}`)
  }

  public async fetchAllPatches(rid: RID): Promise<[Result<Patch[]>]> {
    // TODO: refactor to make only a single request when https://radicle.zulipchat.com/#narrow/stream/369873-support/topic/fetch.20all.20patches.20in.20one.20req is resolved
    const all = Promise.all([
      fetchFromHttpd(`/projects/${rid}/patches`, { query: { state: 'draft', perPage: 500 } }),
      fetchFromHttpd(`/projects/${rid}/patches`, { query: { state: 'open', perPage: 500 } }),
      fetchFromHttpd(`/projects/${rid}/patches`, {
        query: { state: 'archived', perPage: 500 },
      }),
      fetchFromHttpd(`/projects/${rid}/patches`, { query: { state: 'merged', perPage: 500 } }),
    ]) as unknown

    return await (all as Promise<[Result<Patch[]>]>)
  }

  public async getCurrentProjectId(): Promise<Result<RID>> {
    const memo = memoizedGetCurrentProjectId()
    if (!memo) {
      return await Promise.resolve({ error: new Error('failed to get current project id') })
    }

    return await Promise.resolve({ data: memo })
  }

  public async getAllProjects(): Promise<Result<Project[]>> {
    return await fetchFromHttpd('/projects', { query: { show: 'all' } })
  }
}
