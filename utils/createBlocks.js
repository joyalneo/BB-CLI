/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable camelcase */
const axios = require('axios')
const { spinnies } = require('../loader')
const { blocksCreate } = require('./api')
const { getShieldHeader, getShieldHeaderWithSpaceID } = require('./getHeaders')

/**
 *
 * @param {Number} block_type 1 or 2 or 3
 * @param {String} block_name Long name of block
 * @param {String} block_short_name Preferred short name of block
 * @param {Boolean} is_public Visibility of repo
 * @param {String} github_url Github repo url
 * @param {String} block_desc Description same as github repo description
 * @param {String} job_config Configuration for job
 */
// eslint-disable-next-line consistent-return
async function createBlocks(block_name_array, block_meta_data_map, currentSpaceID) {
  //   spinnies.add('createBlocks', { text: `Creating Blocks ` })

  const postData = {
    block_meta_data_map,
    block_name_array,
  }

  console.log("block metadata map is \n",JSON.stringify(block_meta_data_map))

  try {
    const shieldHeader = getShieldHeader()

    shieldHeader.space_id = currentSpaceID

    const res = await axios.post(blocksCreate, postData, {
      headers: shieldHeader,
    })

    // spinnies.succeed('createBlocks', { text: `Blocks Created Successfully` })
    // spinnies.remove('createBlocks')

    return res.data
  } catch (err) {
    // spinnies.fail('', { text: `Blocks Creation Failed` })
    // spinnies.remove('createBlocks')
    throw err
  }
}

module.exports = createBlocks
