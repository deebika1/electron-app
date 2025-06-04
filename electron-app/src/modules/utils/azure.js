const { APIConfig } = require('./../../config/api');
const { createReadStream, createWriteStream } = require('fs');
const { post, get, putStream } = require('./../http/index');
const { makeDir } = require('./io');
const { join } = require('path')
const FormData = require('form-data');
const querystring = require('querystring');
const { env } = require('../../config/env.json');
const https = require('https');

const getChecksum = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            let encodedURL = encodeURI(path);
            encodedURL =  await decodeSymbol(encodedURL);
            const data = querystring.stringify({
                docId: encodedURL,
            });
            const docProp = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.getProperties}?${data}`, {}, headers);
            resolve(docProp.contentMD5);
        } catch (e) {
            global.log(e, 'getChecksum error');
            reject(e);
        }
    });
}

const uploadNewFile = async (src, dest, srcName) => {
    return new Promise(async (resolve, reject) => {
        try {
            
            // let destPath =  `${dest}${srcName}`;
            // const { sasKey } = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.checkinWithSASKey}?docPath=${destPath}`);
            // await putStream(sasKey, src);
            // resolve({ path: destPath, uuid: "azure" });
            global.log(src, 'Uploading file');
            const formData = new FormData();
            formData.append('content', createReadStream(src));
            formData.append('docPath', `${dest}${srcName}`);
            const headers = {
                'Content-Type': 'multipart/form-data; boundary=' + formData._boundary,
                'Accept': 'application/json'
            };
            const docProp = await post(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.checkin}`, formData, headers);
            global.log(docProp, 'Uploaded file');
            resolve(docProp);
        } catch (e) {
            global.log(`Azure Upload File Failed error source : ${src}, dest :${dest}`);
            reject(e);
        }
    });
}

const uploadExistingFile = (src, dest) => {
    return new Promise(async (resolve, reject) => {
        try {
            
            // const { sasKey } = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.checkinWithSASKey}?docPath=${dest}`);
            // await putStream(sasKey, src);
            // resolve({ path: dest, uuid: "azure" });

            const formData = new FormData();
            formData.append('content', createReadStream(src));
            formData.append('docPath', `${dest}`);
            const headers = {
                'Content-Type': 'multipart/form-data; boundary=' + formData._boundary,
                'Accept': 'application/json'
            };
            let encodedURL = encodeURI(dest);
            encodedURL =  await decodeSymbol(encodedURL);
            const docProp = await post(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.checkin}`, formData, headers);
            await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.checkout}?docId=${encodedURL}`);
            resolve(docProp);
        } catch (e) {
            global.log(e, 'uploadExistingFile error');
            reject(e);
        }
    });
}

const getRetreiveBlobFilesURL = (Path) => {
    return new Promise(async (resolve, reject) => {
        try {
            let encodedURL = encodeURI(Path);
            encodedURL =  await decodeSymbol(encodedURL);
            const data = querystring.stringify({
                docPath: encodedURL
            });
            let response = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.retreiveBlobFilesURL}?${data}`, {}, {});
            resolve(response);
        } catch (e) {
            global.log(e, 'getRetreiveBlobFilesURL error');
            reject(e);
        }
    });
}


const downloadFile = (path, dest1, name, mode = undefined) => {
    return new Promise(async (resolve, reject) => {
        try {
            let dest = dest1.replace('/**/*/','')
            await makeDir(dest);
            let encodedURL = encodeURI(path);
            encodedURL =  await decodeSymbol(encodedURL);
            const out = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.download}?docPath=${encodedURL}`);
            if (out.path != "") {
                await httpDownload(out, dest, name);
                // await download(out.path, `${dest}`, mode)
                resolve();
            } else {
                resolve();
            }
        } catch (e) {
            global.log(e, 'downloadFile error');
            reject(e);
        }
    });
}

const downloadFileURL = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            let encodedURL = encodeURI(path);
            encodedURL =  await decodeSymbol(encodedURL);
            const out = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.download}?docPath=${encodedURL}`);
            resolve(out.path);
        } catch (e) {
            global.log(e, 'downloadFile error');
            reject(e);
        }
    });
}

const downloadreorderFile = downloadFile;

const deleteFile = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Accept': 'application/json'
            };
            let encodedURL = encodeURI(path);
            encodedURL =  await decodeSymbol(encodedURL);
            const data = querystring.stringify({
                docId: encodedURL
            });
            await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.delete}?${data}`, {}, headers);
            resolve(true);
        } catch (e) {
            global.log(e, 'deleteFile error');
            reject(e);
        }
    });
}


function httpDownload(out, dest, name) {
    return new Promise((resolve, reject) => {
        try {
            https.get(out.path, (res) => {
                const path = join(dest, name);
                const filePath = createWriteStream(path);
                res.pipe(filePath);
                filePath.on('finish', () => {
                    filePath.close();
                    resolve();
                });
                filePath.on('error', (e) => {
                    filePath.close();
                    reject(e);
                });
            });
        } catch (error) {
            reject(error);
        }
    })
}

async function isFileExist(path) {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Accept': 'application/json'
            };
            let encodedURL = encodeURI(path);
            encodedURL =  await decodeSymbol(encodedURL);
            const data = querystring.stringify({
                docPath: encodedURL
            });
            let out = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.isExists}?${data}`, {}, headers);
            resolve({ isFileExist: out.exist, uuid: "azure", modifiedTime : out.lastModified });
        } catch (e) {
            reject(e);
        }
    });
}


const copyFile = ({ srcPath, name, destBasePath }) => {
    const url = APIConfig.azure.url.copy;
    const targetPath = destBasePath + name;
    return new Promise(async (resolve, reject) => {
        try {
            const formData = new FormData();
            formData.append('docId', srcPath);
            formData.append('dstId', targetPath);
            const headers = {
                ...formData.getHeaders()
            }
            let isFileExists = await isFileExist(srcPath)
            if (isFileExists && isFileExists.isFileExist) {
                await post(`${APIConfig.azure.getBaseURL()}${url}`, formData, headers);
                resolve({ path: targetPath, uuid: "azure" });
            } else {
                resolve({ path: "", uuid: "" })
            }
        } catch (err) {
            reject(err);
        }
    });
}

const decodeSymbol = async(EncodeURL) =>{
    return new Promise((resolve, reject) => {
           resolve(EncodeURL.replace(/%20/g, ' ').replace(/%25/g, ' '))
    })
}

module.exports = {
    getChecksum,
    uploadExistingFile,
    uploadNewFile,
    downloadFile,
    deleteFile,
    downloadreorderFile,
    isFileExist,
    copyFile,
    downloadFileURL,
    getRetreiveBlobFilesURL,
    httpDownload
};