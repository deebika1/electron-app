const { config } = require('./../../config/index');
const { createHash } = require('crypto');
const { createReadStream, access, constants } = require('fs');
const { homedir } = require('os');
const { join } = require('path');
const os = require('os');

const getFormattedClientPath = (path) => {
    return path.replace(config.okm.root, '').replace(/\\/g, "/");
}

const getBaseDir = (duName) => {
    if (os.platform() == "win32"){
      return join(homedir(), `../../itools/iwms/${duName}`);
    }
    else {
      return join(homedir(), config.baseFolderName);
    }
}

const checkIsInternalConnection = (sharedPath) => {
  return new Promise((resolve) => {
    access(sharedPath, constants.R_OK, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};

const createHashObject = (path) => {
    return createHash('md5').update(path).digest('hex');
}

const getChecksum = (path) => {
    const readStream = createReadStream(path);
    const hash = createHash('md5');
    hash.setEncoding('hex');
    return new Promise(async (resolve, reject) => {
        try {
            readStream.on('close', () => {
                hash.end();
                resolve(hash.read());
            });
            readStream.on('error', (e) => {
                global.log(e, 'hash error');
                reject(e);
            });
            readStream.pipe(hash);
        } catch (e) {
            global.log(e, 'hash error');
            reject(e);
        }
    });
};

module.exports = {
    getFormattedClientPath,
    getChecksum,
    createHashObject,
    getBaseDir,
    checkIsInternalConnection
};
