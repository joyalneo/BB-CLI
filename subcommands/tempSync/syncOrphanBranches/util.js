/* eslint-disable prefer-const */
/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const { existsSync, mkdirSync, rmdirSync, readdirSync, statSync, copyFileSync, unlinkSync } = require('fs')
const path = require('path')

const { GitManager } = require('../../../utils/gitManagerV2')
const { checkAndSetGitConfigNameEmail } = require('../../../utils/gitCheckUtils')
const { getGitConfigNameEmail, getGitConfigNameEmailFromConfigStore } = require('../../../utils/questionPrompts')
const { headLessConfigStore } = require('../../../configstore')

const generateOrphanBranch = async (options) => {
  const { bbModulesPath, block, repoUrl, blockMetaDataMap } = options
  let blockConfig = block.blockManager.config

  let orphanBranchName = blockConfig.source.branch

  const orphanBranchPath = path.resolve(bbModulesPath, orphanBranchName)
  const orphanBranchFolderExists = existsSync(orphanBranchPath)
  let exclusions = [
    '.git',
    '._ab_em',
    '._ab_em_elements',
    'cliruntimelogs',
    'logs',
    'headless-config.json',
    'metaDataMap.json',
    'testApiPayload.json',
  ]
  const orphanRemoteName = 'origin'
  const orphanCommitMessage = ''

  if (blockConfig.type === 'package') {
    const memberBlocks = block?.memberBlocks ?? {}
    Object.keys(memberBlocks)?.map((item) => {
      const memberBlockDirectory = blockMetaDataMap[item].blockManager.directory
      const directoryPathArray = memberBlockDirectory.split('/')
      const directoryRelativePath = directoryPathArray[directoryPathArray.length - 1]
      console.log(
        `directory relative path for block ${blockMetaDataMap[item].blockManager.config.name} is\n`,
        directoryRelativePath
      )
      exclusions.push(directoryRelativePath)
    })
  }

  if (!(block?.workSpaceCommitID?.length > 0)) {
    console.log(`Error syncing ${blockConfig.name}`)
    return
  }

  const Git = new GitManager(orphanBranchPath, repoUrl)

  if (!orphanBranchFolderExists) {
    try {
      mkdirSync(orphanBranchPath)

      await Git.init()

      const { gitUserName, gitUserEmail } = await getGitConfigNameEmailFromConfigStore(true, headLessConfigStore)

      await checkAndSetGitConfigNameEmail(orphanBranchPath, { gitUserEmail, gitUserName })
      // console.log(`Git local config updated with ${gitUserName} & ${gitUserEmail}`)

      await Git.addRemote(orphanRemoteName, repoUrl)

      await Git.fetch()

      // await Git.checkoutBranch(defaultBranch)
    } catch (err) {
      console.log('error is', err)
      rmdirSync(orphanBranchPath, { recursive: true, force: true })
      throw err
    }
  }

  const remoteBranchData = await Git.checkRemoteBranch(orphanBranchName, orphanRemoteName)

  const remoteBranchExists = remoteBranchData?.out ?? ''.includes(orphanBranchName)

  if (!remoteBranchExists) {
    console.log('entered if case orphan branch doesnt exists on Remote \n')

    await Git.newOrphanBranch(orphanBranchName)

    copyDirectory(block.blockManager.directory, orphanBranchPath, exclusions)

    await Git.stageAll()

    await Git.commit(buildCommitMessage(block.workSpaceCommitID, orphanCommitMessage))

    await Git.setUpstreamAndPush(orphanBranchName)
  } else {
    console.log('entered if case orphan branch already exists on Remote \n')
    await Git.fetch()

    await Git.checkoutBranch(orphanBranchName)

    await Git.pullBranch(orphanBranchName, orphanRemoteName)

    //compare code from the existing workspace folder and the orphan branch folder

    let orphanBranchCommits = await getLatestCommits(orphanBranchName, 1, Git)

    const orphanBranchCommitMessage = orphanBranchCommits[0].split(' ')[1]

    const orphanBranchCommitHash = retrieveCommitHash(orphanBranchCommitMessage)

    console.log(
      `commit hashes for orphan and workspace for block ${blockConfig.name} are\n`,
      orphanBranchCommitHash,
      block.workSpaceCommitID,
      orphanBranchCommitHash !== block.workSpaceCommitID
    )

    if (orphanBranchCommitHash !== block.workSpaceCommitID) {
      clearDirectory(orphanBranchPath, exclusions)

      copyDirectory(block.blockManager.directory, orphanBranchPath, exclusions)

      await Git.stageAll()

      await Git.commit(buildCommitMessage(block.workSpaceCommitID, orphanBranchCommitMessage))

      await Git.push(orphanBranchName)
    }
  }
}

// const copyDirectory = (sourceDir, destinationDir, excludedDirs) => {
//   const copyCommandWithExclusions = `rsync -av --exclude={${excludedDirs.join(',')}} ${sourceDir}/ ${destinationDir}/`

//   console.log('copy command with exclusions is', copyCommandWithExclusions)
//   // execSync(copyCommandWithExclusions)
// }

const getLatestCommits = async (branchName, n, Git) => {
  let latestWorkSpaceCommit = await Git.getCommits(branchName, n)

  let commits = latestWorkSpaceCommit?.out?.trim()?.split('\n') ?? []

  return commits
}

function copyDirectory(sourceDir, destinationDir, exclusions) {
  const stack = [
    {
      source: sourceDir,
      destination: destinationDir,
    },
  ]

  while (stack.length > 0) {
    const { source, destination } = stack.pop()

    if (!existsSync(destination)) {
      mkdirSync(destination, { recursive: true })
    }

    const files = readdirSync(source)

    files.forEach((file) => {
      const sourcePath = path.join(source, file)
      const destinationPath = path.join(destination, file)

      const fileStats = statSync(sourcePath)

      if (!isExcluded(file, fileStats, exclusions)) {
        if (fileStats.isFile()) {
          copyFileSync(sourcePath, destinationPath)
        } else {
          stack.push({
            source: sourcePath,
            destination: destinationPath,
          })
        }
      }
    })
  }
}

function clearDirectory(directoryPath, exclusions) {
  const stack = [directoryPath]

  while (stack.length > 0) {
    const currentPath = stack.pop()

    if (!existsSync(currentPath)) {
      continue
    }

    const files = readdirSync(currentPath)

    for (const file of files) {
      const filePath = path.join(currentPath, file)
      const fileStats = statSync(filePath)

      if (!isExcluded(file, fileStats, exclusions)) {
        if (fileStats.isFile()) {
          unlinkSync(filePath)
        } else {
          stack.push(filePath)
        }
      }
    }

    rmdirSync(currentPath)
  }
}

function isExcluded(name, stats, exclusions) {
  return exclusions.some((exclusion) => {
    if (stats.isDirectory()) {
      return name.startsWith(exclusion)
    } else {
      return name === exclusion
    }
  })
}

const buildCommitMessage = (commitHash, commitMesage) => {
  return `[commitHash:${commitHash}] ${commitMesage}`
}

const retrieveCommitHash = (commitMessage) => {
  const pattern = /\[commitHash:(\w+)\]/
  const matches = commitMessage.match(pattern)
  if (matches && matches.length > 1) {
    return matches[1]
  }
  return ''
}
module.exports = {
  generateOrphanBranch,
  getLatestCommits,
}
