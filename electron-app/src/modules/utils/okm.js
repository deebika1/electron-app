const { APIConfig } = require('./../../config/api');
const { createReadStream, createWriteStream } = require('fs');
const { post, put, get, _delete } = require('./../http/index');
const { makeDir } = require('./io');
const FormData = require('form-data');
const { basename } = require('path');
const querystring = require('querystring');
const { env } = require('../../config/env.json');
const request = require('request');
const progress = require('request-progress');

const getChecksum = (uuid) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            const data = querystring.stringify({
                docId: uuid,
            });
            const docProp = await get(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.getDocumentProps}?${data}`, {}, headers);
            resolve(docProp.actualVersion.checksum);
        } catch (e) {
            global.log(e, 'getChecksum error');
            reject(e);
        }
    });
}

const checkout = (uuid) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            const data = querystring.stringify({
                docId: uuid
            });
            await get(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.checkout}?${data}`, {}, headers);
            resolve(true);
        } catch (e) {
            global.log(e, 'checkout error');
            reject(e);
        }
    });
}

const getUuid = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            let out = await isFileExist(path);
            if(out.isFileExist) {
                resolve(out.uuid) 
            }else{
                throw out.error;
            }
        } catch (e) {
            global.log(e, 'checkout error');
            reject(e);
        }
    });
}

const _copyFile = ({ src, dest, name, destBasePath }) => {
    const headers = {
        'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
        'Accept': 'application/json'
    };
    const url = APIConfig.okm.document.documentCopy;
    const data = querystring.stringify({
        docId: src,
        dstId: dest,
        name
    });
    const targetPath = destBasePath + name;
    return new Promise(async (resolve, reject) => {
        try {
            const out = await isFileExist(targetPath);
            if (out.isFileExist == false) {
                await put(`${APIConfig.okm.getOKmNativeBaseURL()}${url}?${data}`, {}, headers);
                const uuidData = await getUuid(targetPath);
                resolve({ path: targetPath, uuid: uuidData });
            } else {
                resolve({ path: targetPath, uuid: out.uuid });
            }
        } catch (err) {
            // if (err.message?.data && err.message.data.includes('PathNotFoundException')) {
            //     try {
            //         await service.put(`${config.okmNative.base_url}${url}?${data}`, {}, headers);
            //         const uuidData = await getUuid(targetPath);
            //         resolve({ path: targetPath, uuid: uuidData });
            //     } catch (err) {
            //         reject(err);
            //     }
            // } else {
                reject(err);
            //}
        }
    });
}

const folderCreate = async (folderPath) => {
    return new Promise(async (resolve, reject) => {
        const headers = {
            'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
            'Accept': 'application/json'
        }
        const data = querystring.stringify({
            fldPath: folderPath
        });
        try {
            const out = await isFileExist(folderPath);
            if (out.isFileExist == false) {
                await put(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.folderCreate}?${data}`, folderPath, headers);
                const uuidData = await getUuid(folderPath);
                resolve(uuidData);
            } else {
                resolve(out.uuid);
            }
        }
        catch (err) {
            // if (err.message?.data && err.message.data.includes('PathNotFoundException')) {
            //     try {
            //         await put(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.folderCreate}?${data}`, folderPath, headers);
            //         const uuidData = await getUuid(folderPath);
            //         resolve(uuidData);
            //     }
            //     catch (err) {
            //         reject(err);
            //     }
            // } else {
                reject(err);
            //}
        }
    });
}

const uploadNewFile = async (src, dest, srcName) => {
    return new Promise(async (resolve, reject) => {
        try {
            let isExists = await isFileExist(`${dest}${srcName}`)
            if (isExists.isFileExist) {
                await uploadExistingFile(src,isExists.uuid);
                global.log(`Upload completed for ${srcName}`);
                resolve({ uuid: isExists.uuid, path: `${dest}${srcName}` });
            } else {
                const formData = new FormData();
                formData.append('content', createReadStream(src));
                formData.append('docPath', `${dest}${srcName}`);
                const headers = {
                    'Content-Type': 'multipart/form-data; boundary=' + formData._boundary,
                    'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                    'Accept': 'application/json'
                };
                await folderCreate(dest);
                let response = await post(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.createFile}`, formData, headers);
                global.log(`Upload completed for ${srcName}`);
                resolve({ uuid: response.uuid, path: response.path });
            }
        } catch (e) {
            global.log(e, 'uploadFiletoOpenKM error');
            if (e?.message) { // for dms error message
                e.message = e.message.includes('FileNotFoundException') ? 'Uploading was interrupted. Please retry the current action' : e.message;
            }
            reject(e);
        }
    });
}

const uploadExistingFile = (src, uuid) => {
    return new Promise(async (resolve, reject) => {
        try { 
            const fileName = basename(src);
            global.log(`Upload started for ${fileName}`);
            await checkout(uuid);
            const formData = new FormData();
            formData.append('content', createReadStream(src));
            formData.append('docId', uuid);
            const headers = {
                'Content-Type': 'multipart/form-data; boundary=' + formData._boundary,
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                'Accept': 'application/json'
            };
            await post(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.checkin}`, formData, headers);
            global.log(`Upload completed for ${fileName}`);
            resolve();
        } catch (e) {
            global.log(e, 'uploadExistingFile error');
            if (e?.message) { // for dms error message
                e.message = e.message.includes('FileNotFoundException') ? 'Uploading was interrupted. Please retry the current action' : e.message;
            }
            reject(e);
        }
    });
}

const downloadFile = (uuid, dest, name, mode = undefined) => {
    return new Promise(async (resolve, reject) => {
        try {
            await makeDir(dest);
            global.log(`Folder created (${dest})`);
            const url = `${APIConfig.okm.getBaseURL()}${APIConfig.okm.document.download}/${uuid}`;
            const fileName = basename(`${dest}${name}`);
            global.log(`download started for ${fileName}`);
            const writeStream = createWriteStream(`${dest}${name}`, { mode });
            writeStream.on('close', () => {
                global.log(`File closed (${fileName})`);
                resolve(`${dest}${name}`);
            });
            var options = { 
                'method': 'GET',
                'url': url,
                'headers': {
                    'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                    'Accept': 'application/octet-stream'
                }
            };
            progress(request(options))
            .on('progress', (state) => {
                state.fileName = fileName;
                global.log(state, 'download progress');
            })
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                global.log(`download completed for ${fileName}`);
            })
            .pipe(writeStream);
        } catch (e) {
            global.log(e, 'downloadFile error');
            if (e?.message) e.message = e.message; // for dms error message
            reject(e);
        }
    });
}


const downloadreorderFile = (uuid, dest, name, mode = undefined) => {
    return new Promise(async (resolve, reject) => {
        try {
            global.log(`Folder created (${dest})`);
            const data = querystring.stringify({
                docId: uuid
            });
            const url = `${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.getContent}?${data}`;
            const fileName = basename(`${dest}${name}`);
            const writeStream = createWriteStream(`${dest}${name}`, { mode });
            writeStream.on('close', () => {
                global.log(`File closed (${fileName})`);
                resolve(`${dest}${name}`);
            });
            var options = { 
                'method': 'GET',
                'url': url,
                'headers': {
                    'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                    'Accept': 'application/octet-stream'
                }
            };
            progress(request(options))
            .on('progress', (state) => {
                state.fileName = fileName;
                global.log(state, 'download progress');
            })
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                global.log(`download completed for ${fileName}`);
            })
            .pipe(writeStream);
        } catch (e) {
            global.log(e, 'downloadFile error');
            if (e?.message) e.message = e.message; // for dms error message
            reject(e);
        }
    });
}

const deleteFile = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                'Accept': 'application/json'
            };
            const fileExistDetails = await isFileExist(path);
            if (fileExistDetails.isFileExist) {
                const data = querystring.stringify({
                    docId: fileExistDetails.uuid
                });
                await _delete(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.delete}?${data}`, {}, headers);
            }
            resolve(true);
        } catch (e) {
            global.log(e, 'deleteFile error');
            reject(e);
        }
    });
}

async function isFileExist(path) {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            const data = querystring.stringify({
                nodePath: path
            });
            let uuid = await get(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.getUuid}?${data}`, {}, headers);
            resolve({ isFileExist: true, uuid: uuid });
        } catch (e) {
            if (e.message && e.message.includes('PathNotFoundException')) {
                resolve({ isFileExist: false, error: e });
            } else {
                reject(e);
            }
        }
    });
}

const unlockDocument = async (docId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`
            };
            const data = querystring.stringify({
                docId: docId,
            });
            var resultDetails = await isLocked(docId)
            if (resultDetails) {
                const prop = await put(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.unlock}?${data}`, {}, headers);
                resolve(prop);
            } else {
                resolve()
            }
        } catch (e) {
            global.log(e, 'getChecksum error');
            reject(e);
        }
    });
}

const isLocked = (docId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Basic ${env[global.MODE].OKM_AUTH}`
            };
            const data = querystring.stringify({
                docId: docId,
            });
            const isLockedDetails = await get(`${APIConfig.okm.getOKmNativeBaseURL()}${APIConfig.okm.document.isLocked}?${data}`, {}, headers);
            resolve(isLockedDetails);
        } catch (e) {
            global.log(e, 'getChecksum error');
            reject(e);
        }
    });
}
module.exports = {
    getChecksum,
    uploadExistingFile,
    uploadNewFile,
    getUuid,
    downloadFile,
    deleteFile,
    downloadreorderFile,
    unlockDocument,
    isFileExist,
    folderCreate,
    _copyFile
};