const { spawn } = require('child_process');
const { isPathExist } = require('./io');

const openFile = (filePath, softwarePath) => {
    filePath = filePath instanceof Array ? filePath : [filePath];
    spawn(softwarePath, filePath).on('message', (msg) => {
        global.log(msg);
    }).on('error', (err) => {
        global.log(err, 'openFile error');
    });
}

const getSoftwarePath = (softwarePath) => {
    let path = '';
    return new Promise(async (resolve, reject) => {
        try {
            const possiblePaths = softwarePath.split(';').map((path) => path.trim()).filter((path) => path);
            for (let i = 0; i < possiblePaths.length; i++) {
                const possiblePath = possiblePaths[i];
                if (isPathExist(possiblePath)) {
                    path = possiblePath;
                    break;
                }
            }
            resolve(path);
        } catch (e) {
            global.log(e, 'getSoftwarePath error');
            reject(e);
        }
    });
}

const getSoftwarePaths = (softwarePath) => {
    let path = [];
    return new Promise(async (resolve, reject) => {
        try {
            const possiblePaths = softwarePath.split(';').map((path) => path.trim()).filter((path) => path);
            for (let i = 0; i < possiblePaths.length; i++) {
                const possiblePath = possiblePaths[i];
                if (isPathExist(possiblePath)) {
                    path.push(possiblePath);
                }
            }
            resolve(path);
        } catch (e) {
            global.log(e, 'getSoftwarePaths error');
            reject(e);
        }
    });
}

module.exports = {
    openFile,
    getSoftwarePath,
    getSoftwarePaths
};