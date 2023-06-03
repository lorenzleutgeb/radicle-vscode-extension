import { ConfigurationTarget, workspace } from 'vscode'
import { assertUnreachable, exec } from '../utils'

/**
 * Lists they keys of configuration options available to the user along with
 * the possible types their values can have.
 *
 * PRE-CONDITION:
 * Each config key has a matching entry in `contributes.configuration` defined in package.json .
 */
export interface ExtensionConfig {
  'radicle.advanced.pathToRadBinary': string
  'radicle.advanced.pathToNodeHome': string
}

/**
 * Gets the value of a VS Code configuration option.
 *
 * @returns The configuration value if set by the user, otherwise the default value if
 * the config has one set, otherwise `undefined`.
 */
export function getConfig<K extends keyof ExtensionConfig>(
  configKey: K,
): ExtensionConfig[typeof configKey] | undefined {
  const config = workspace.getConfiguration()

  switch (configKey) {
    case 'radicle.advanced.pathToRadBinary':
    case 'radicle.advanced.pathToNodeHome':
      return config.get<ExtensionConfig[typeof configKey]>(configKey)?.trim()
    default:
      return assertUnreachable(configKey)
  }
}

/**
 * Sets the value of a VS Code configuration option.
 */
export function setConfig<K extends keyof ExtensionConfig>(
  configKey: K,
  value: ExtensionConfig[typeof configKey],
): Thenable<void> {
  const config = workspace.getConfiguration()

  switch (configKey) {
    case 'radicle.advanced.pathToRadBinary':
    case 'radicle.advanced.pathToNodeHome':
      return config.update(configKey, value, ConfigurationTarget.Global)
    default:
      return assertUnreachable(configKey)
  }
}

/**
 * Resolves the path where the Radicle CLI binary _is expected to be located_, as per
 * the installation script.
 *
 * @returns The path if successfully resolved, otherwise `undefined`
 * @see https://radicle.xyz/install
 */
export async function getDefaultPathToRadBinary(): Promise<string | undefined> {
  const homeDir = await exec('echo $HOME')
  const defaultPath = homeDir ? `${homeDir}/.radicle/bin/rad` : undefined

  return defaultPath
}

/**
 * Resolves the default path to the Radicle CLI binary _after having confirmed_ that the binary
 * is indeed there and accessible for command execution.
 *
 * @returns The path if successfully resolved, otherwise `undefined`
 */
export async function getValidatedDefaultPathToRadBinary(): Promise<string | undefined> {
  const defaultPath = await getDefaultPathToRadBinary()

  if (!defaultPath) {
    return undefined
  }

  const isBinaryAtDefaultPath = Boolean(await exec(defaultPath))

  return isBinaryAtDefaultPath ? defaultPath : undefined
}

/**
 * Resolves the path to which the PATH alias`rad` points, if it is set in the shell and if
 * it indeed points to a Radicle CLI binary accessible for command execution.
 *
 * @returns The path if successfully resolved, otherwise `undefined`
 */
export async function getValidatedAliasedPathToRadBinary(): Promise<string | undefined> {
  const aliasedPath = await exec('which rad')
  if (!aliasedPath) {
    return undefined
  }

  const isBinaryAtAliasedPath = Boolean(await exec(aliasedPath))

  return isBinaryAtAliasedPath ? aliasedPath : undefined
}

/**
 * Resolves the default path where the home for a Radicle node _is expected to be located_,
 * as per the installation script.
 *
 * @returns The path if successfully resolved, otherwise `undefined`
 * @see https://radicle.xyz/install
 */
export async function getDefaultPathToNodeHome(): Promise<string | undefined> {
  const homeDir = await exec('echo $HOME')
  const defaultPath = homeDir ? `${homeDir}/.radicle` : undefined

  return defaultPath
}

/**
 * Resolves the _preferred_ path where the home for a Radicle node _is expected to be located_,
 * prioritizing user-defined configuration.
 *
 * If no home is is located at the resolved path, the CLI may create one automatically.
 *
 * @returns The path if successfully resolved, otherwise `undefined`
 */
export async function getResolvedPathToNodeHome(): Promise<string | undefined> {
  const path =
    getConfig('radicle.advanced.pathToNodeHome') || (await getDefaultPathToNodeHome())

  return path
}

/**
 * Composes a text to interpolate into log/notification messages, when there's need
 * to reference the Radicle node's resolved home path, but _only if it's the
 * non-default path_ (for brevity).
 *
 * @return The string ` stored in "${resolvedPathToNodeHome}"` (with a preceding space char)
 * if the resolved path is non-default, otherwise the empty string.
 */
export async function composeNodePathMsg(): Promise<string> {
  const resolvedPathToNodeHome = await getResolvedPathToNodeHome()
  const isResolvedPathToNodeHomeTheDefaultOne =
    resolvedPathToNodeHome === (await getDefaultPathToNodeHome())

  const nodePathMsg = isResolvedPathToNodeHomeTheDefaultOne
    ? ''
    : ` stored in "${resolvedPathToNodeHome}"`

  return nodePathMsg
}