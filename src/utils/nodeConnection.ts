import { getConfig } from 'src/helpers'
import type { RadicleNodeConnection } from '../types/node'
import { ClassicNode } from './classicNodeConnection'
import { NAPINode as NAPINodeConnection } from './napiNodeConnection'

let nodeConnection: RadicleNodeConnection | undefined

export function getNodeConnection(): RadicleNodeConnection {
  if (nodeConnection) {
    return nodeConnection
  }

  nodeConnection = getConfig('radicle.advanced.useNodeApi')
    ? new NAPINodeConnection()
    : new ClassicNode()

  return nodeConnection
}
