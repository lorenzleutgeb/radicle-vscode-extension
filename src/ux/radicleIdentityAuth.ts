import { window } from 'vscode'
import { exec, log, showLog } from '../utils'
import { getExtensionContext } from '../store'
import {
  composeNodeHomePathMsg,
  getRadCliRef,
  getRadNodeSshKey,
  getRadicleIdentity,
  getResolvedPathToNodeHome,
  isRadCliInstalled,
  isRadicleIdentityAuthed,
  isRepoRadInitialised,
} from '../helpers'

function composeRadAuthSuccessMsg(
  didAction: 'foundUnlockedId' | 'autoUnlockedId' | 'unlockedId' | 'createdId',
): string {
  let msgPrefix: string
  switch (didAction) {
    case 'foundUnlockedId':
      msgPrefix = 'Using already unlocked'
      break
    case 'autoUnlockedId':
      msgPrefix = 'Auto-unlocked (using associated passphrase already in Secret Storage) the'
      break
    case 'unlockedId':
      msgPrefix = 'Succesfully unlocked'
      break
    case 'createdId':
      msgPrefix = 'Succesfully created new'
      break
    default:
      msgPrefix = 'Succesfully authenticated'
  }
  const radicleId = getRadicleIdentity('DID')
  if (!radicleId) {
    throw new Error('Failed resolving radicleId')
  }

  const msg = `${msgPrefix} Radicle identity "${radicleId}"${composeNodeHomePathMsg()}`

  return msg
}

/**
 * Attempts to authenticate a Radicle identity using either the the stored (if any) passphrass
 * or (if `minimizeUserNotifications` options is `false`) the one the user will manually type
 * in.
 *
 * @returns `true` if an identity is authenticated by the end of the call, otherwise `false`.
 */
export async function authenticate(
  options: { minimizeUserNotifications: boolean } = { minimizeUserNotifications: false },
): Promise<boolean> {
  if (isRadicleIdentityAuthed()) {
    return true
  }

  const radicleId = getRadicleIdentity('DID')
  const secrets = getExtensionContext().secrets

  /* Attempt automatic authentication */
  if (radicleId) {
    const storedPass = await secrets.get(radicleId)

    if (storedPass) {
      const didAuth = exec(`RAD_PASSPHRASE=${storedPass} ${getRadCliRef()} auth`)
      if (didAuth) {
        log(composeRadAuthSuccessMsg('autoUnlockedId'), 'info')

        return true
      }

      await secrets.delete(radicleId)
      log(
        `Deleted the stored, stale passphrase previously associated with identity "${radicleId}"`,
        'warn',
      )
    }
  }

  if (options.minimizeUserNotifications) {
    return false
  }

  /* Notify that authentication is required */
  const button = 'Authenticate'
  const authStatusMsg = 'You need to be authenticated before performing this action'
  const userSelection = await window.showErrorMessage(authStatusMsg, button)
  if (userSelection !== button) {
    return false
  }

  /* Attempt manual identity authentication */
  const title = radicleId
    ? `Unlocking Radicle identity "${radicleId}"`
    : 'Creating new Radicle identity'
  const prompt = radicleId
    ? `Please enter the passphrase used to unlock your Radicle identity.`
    : 'Please enter a passphrase used to protect your new Radicle identity.'
  const typedInRadPass = (
    await window.showInputBox({
      title,
      prompt,
      placeHolder: '************',
      validateInput: (input) => {
        if (!radicleId) {
          return undefined
        }

        const didAuth = exec(`RAD_PASSPHRASE=${input.trim()} ${getRadCliRef()} auth`)
        if (!didAuth) {
          return "Current input isn't the correct passphrase to unlock the identity"
        }

        exec(`ssh-add -D ${getRadNodeSshKey('hash')!}`)

        return undefined
      },
      password: true,
      ignoreFocusOut: true,
    })
  )?.trim()
  if (typedInRadPass === undefined) {
    const msg = 'Radicle authentication was aborted'
    log(msg, 'info')
    window.showWarningMessage(msg)

    return false
  }

  /* Authenticate for real now that we have a confirmed passphrase */
  const didAuth = exec(`RAD_PASSPHRASE=${typedInRadPass} ${getRadCliRef()} auth`)
  if (!didAuth) {
    return false
  }

  secrets.store(getRadicleIdentity('DID')!, typedInRadPass)

  const authSuccessMsg = composeRadAuthSuccessMsg(radicleId ? 'unlockedId' : 'createdId')
  log(authSuccessMsg, 'info')
  window.showInformationMessage(authSuccessMsg)

  return true
}

/**
 * Will check if a Radicle identity is authenticated, log either way, and depending on the
 * `minimizeUserNotifications` optional param, might display notifications to the user,
 * including asking them to type in an authenticating passphrase.
 *
 * @returns `true` if an identity is authenticated by the end of the call, otherwise `false`.
 */
export async function validateRadicleIdentityAuthentication(
  options: { minimizeUserNotifications: boolean } = { minimizeUserNotifications: false },
): Promise<boolean> {
  if (!isRadCliInstalled()) {
    return false
  }

  if (isRadicleIdentityAuthed()) {
    const msg = composeRadAuthSuccessMsg('foundUnlockedId')
    log(msg, 'info')
    !options.minimizeUserNotifications && window.showInformationMessage(msg)

    return true
  }

  const radicleId = getRadicleIdentity('DID')
  const pathToNodeHome = getResolvedPathToNodeHome()!
  const msg = radicleId
    ? `Found non-authenticated identity "${radicleId}" stored in "${pathToNodeHome}"`
    : `No Radicle identity is currently stored in "${pathToNodeHome}"`
  log(msg, 'warn')

  if (!options.minimizeUserNotifications || isRepoRadInitialised()) {
    return await authenticate({ minimizeUserNotifications: options.minimizeUserNotifications })
  }

  return false
}

/**
 * De-authenticates any currently authed Radicle identity by removing the unlocked key from
 * the ssh-agent and the associated stored passphrase (if any) from the extension's
 * Secret Storage.
 *
 * @returns `true` if no identity is currently authed any more, otherwise `false`
 */
export function deAuthCurrentRadicleIdentity(): boolean {
  const sshKey = getRadNodeSshKey('hash')
  if (!sshKey) {
    const msg = `Failed de-authenticating current Radicle identity because none was found in "${getResolvedPathToNodeHome()!}"`
    window.showWarningMessage(msg)
    log(msg, 'warn')

    return true
  }

  const didDeAuth = exec(`ssh-add -D ${sshKey}`, { shouldLog: true }) !== undefined
  const radicleId = getRadicleIdentity('DID')!
  getExtensionContext().secrets.delete(radicleId)

  if (!didDeAuth) {
    const button = 'Show output'
    const msg = `Failed de-authenticating Radicle identity (DID) "${radicleId}"${composeNodeHomePathMsg()}.`
    window.showErrorMessage(msg, button).then((userSelection) => {
      userSelection === button && showLog()
    })
    log(msg, 'error')

    return false
  }

  const msg = `De-authenticated Radicle identity (DID) "${radicleId}"${composeNodeHomePathMsg()} and removed the associated passphrase from Secret Storage successfully`
  window.showInformationMessage(msg)
  log(msg, 'info')

  return true
}