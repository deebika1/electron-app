const { APIConfig } = require('./../../config/api');
const { createReadStream, createWriteStream } = require('fs');
const { post, get } = require('./../http/index');
const { makeDir } = require('./io');
const { join } = require('path')
const FormData = require('form-data');
const querystring = require('querystring');
const { env } = require('../../config/env.json');
const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs'); 
const crypto = require('crypto');
const  Readable  = require('stream').Readable;
const { Buffer } = require('buffer');
const { default: axios } = require('axios');
const { copyIOFilesWithImpersonator } = require("../main/copyFiles");


const getlocalChecksum = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            const data = querystring.stringify({
                docId: path,
            });
            const docProp = await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.getlocalProperties}?${data}`, {}, headers);
            resolve(docProp);
        } catch (e) {
            global.log(e, 'getlocalChecksum error');
            reject(e);
        }
    });
}

const uploadlocalNewFileWithImpersonator = async (src, dest, srcName,clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            await copyIOFilesWithImpersonator([{ 
                src: src, 
                dest: `${dest}${srcName}`,  
                isFolder:false,
                clientUtility
            }], false);
            resolve({path: `${dest}${srcName}`, uuid: "local"});
        } catch (e) {
            global.log(e, 'uploadlocalNewFileWithImpersonator error');
            reject(e);
        }
    });
}

const uploadlocalNewFile = async (src, dest, srcName, type = '') => {
    return new Promise(async (resolve, reject) => {
        try {
            global.log(src, 'Uploading file');
            console.log("Save type:" , type)
            const formData = new FormData();
            formData.append('content', createReadStream(src));
            formData.append('docPath', `${dest}${srcName}`);
            const headers = {
                'Content-Type': 'multipart/form-data; boundary=' + formData._boundary,
                'Accept': 'application/json'
            };
            const docProp = await post(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localcheckin}`, formData, headers);
            global.log(docProp, 'Uploaded file');
            resolve(docProp);
        } catch (e) {
            global.log(`Local Upload File Failed error type : ${type} source : ${src}, dest :${dest}`);
            reject(e);
        }
    });
}
const validateUploadedFile =async(src, dest, srcName, type = '')=>{
    return new Promise(async(resolve,reject)=>{
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            const payload = {
                src,
                "dest": `${dest}${srcName}`
            }
            const result = await post(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.validateUploadedFile}`,payload, headers);
            resolve(result);
        } catch (e) {
            global.log(e, 'validateUploadedFile error');
            reject(e);
        }
    })
}
const uploadlocalExistingFileWithImpersonator = (src, dest) => {
    return new Promise(async (resolve, reject) => {
        try {
            await copyIOFilesWithImpersonator([{ 
                src: src, 
                dest: dest,  
                isFolder:false 
            }], false);
            resolve({path: dest, uuid: "local"});
        } catch (e) {
            global.log(e, 'uploadlocalExistingFile error');
            reject(e);
        }
    });
}

const uploadlocalExistingFile = (src, dest) => {
    return new Promise(async (resolve, reject) => {
        try {
            const formData = new FormData();
            formData.append('content', createReadStream(src));
            formData.append('docPath', `${dest}`);
            const headers = {
                'Content-Type': 'multipart/form-data; boundary=' + formData._boundary,
                'Accept': 'application/json'
            };

            const docProp = await post(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localcheckin}`, formData, headers);
            //await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localcheckout}?docId=${dest}`);
            resolve(docProp);
        } catch (e) {
            global.log(e, 'uploadlocalExistingFile error');
            reject(e);
        }
    });
}

const getRetreivelocalFilesURL = (Path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const data = querystring.stringify({
                docPath: Path
            });
            let response = await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.retreivelocalFilesURL}?${data}`, {}, {});
            resolve(response);
        } catch (e) {
            global.log(e, 'getRetreivelocalFilesURL error');
            reject(e);
        }
    });
}

const downloadLocalFileWithImpersonator = (path, dest, name, mode = undefined,clientUtility) => {
    return new Promise(async (resolve, reject) => {
    try{
        await copyIOFilesWithImpersonator([{ 
            src: path, 
            dest:join(dest,name),  
            isFolder:false ,
            clientUtility
        }], false);
        resolve();
    } catch (e) {
        global.log(e, 'downloadlocalFile error');
        reject(e);
    }
    });
}
const downloadlocalFile = (path, dest, name, mode = undefined) => {
    return new Promise(async (resolve, reject) => {
        try {
            await makeDir(dest);
            const out = await axios.get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localdownload}?docPath=${path}`,{responseType:"stream"})//await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.localdownload}?docPath=${path}`);
            const filePath = join(dest,name);
            let writeStream = fs.createWriteStream(filePath);
            out.data.pipe(writeStream);
            writeStream.on('finish', () => {
                console.log('success')
                resolve();
            })
            writeStream.on('error', (error) => {
               reject(error);
            })            
        } catch (e) {
            global.log(e, 'downloadlocalFile error');
            reject(e);
        }
    });
}
const downloadBlobFilestoZip = (path, dest, name, mode = undefined) => {
    return new Promise(async (resolve, reject) => {
        try {
             dest = dest.replace("/**/*","").replace("/*","").split("\\").join("/")
             path = path.replace("/**/*","").replace("/*","").split("\\").join("/")
            await makeDir(dest);
            const out = await axios.get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.ZIPDownloadBlobFolder}?docPath=${path}`,{responseType:"stream"})
            const filePath = join(dest,name);
            let writeStream = fs.createWriteStream(filePath);
            out.data.pipe(writeStream);
            writeStream.on('finish', () => {
                console.log('success')
                resolve({isSuccess:true,filePath:filePath});
            })
            writeStream.on('error', (error) => {
                reject({isSuccess:false,message:error.message?error.message:error});
            })
        } catch (error) {
            global.log(error, 'downloadBlobFilestoZip error');
            reject({isSuccess:false,message:error.message?error.message:error});
        }
    });
}

const downloadlocalFileURL = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const out = await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localdownload}?docPath=${path}`);
            resolve(out.path);
        } catch (e) {
            global.log(e, 'downloadlocalFile error');
            reject(e);
        }
    });
}

const downloadreorderlocalFile = downloadlocalFile;

const deletelocalFile = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Accept': 'application/json'
            };
            const data = querystring.stringify({
                docId: path
            });
            await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localdelete}?${data}`, {}, headers);
            resolve(true);
        } catch (e) {
            global.log(e, 'deletelocalFile error');
            reject(e);
        }
    });
}


// function localhttpDownload(out, dest, name) {
//     return new Promise((resolve, reject) => {
//         try {
//             http.get(out.path, (res) => {
//                 const path = join(dest, name);
//                 const filePath = createWriteStream(path);
//                 res.pipe(filePath);
//                 filePath.on('finish', () => {
//                     filePath.close();
//                     resolve();
//                 });
//                 filePath.on('error', (e) => {
//                     filePath.close();
//                     reject(e);
//                 });
//             });
//         } catch (error) {
//             reject(error);
//         }
//     })
// }

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

async function islocalFileExist(path) {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Accept': 'application/json'
            };
            const data = querystring.stringify({
                docPath: path
            });
            let out = await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localisExists}?${data}`, {}, headers);
            resolve({ islocalFileExist: out.exist, uuid: "local" });
        } catch (e) {
            reject(e);
        }
    });
}


const localcopyFile = ({ srcPath, name, destBasePath }) => {
    const url = APIConfig.local.url.localcopy;
    const targetPath = destBasePath + name;
    return new Promise(async (resolve, reject) => {
        try {
            const formData = new FormData();
            formData.append('docId', srcPath);
            formData.append('dstId', targetPath);
            const headers = {
                ...formData.getHeaders()
            }
            let islocalFileExists = await islocalFileExist(srcPath)
            if (islocalFileExists && islocalFileExists.islocalFileExist) {
                await post(`${APIConfig.local.getBaseURL()}${url}`, formData, headers);
                resolve({ path: targetPath, uuid: "local" });
            } else {
                resolve({ path: "", uuid: "" })
            }
        } catch (err) {
            reject(err);
        }
    });
};

const createZipInLocalServer = (payload) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            const docProp = await post(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.createZipInLocalServer}`,payload, headers);
            resolve(docProp);
        } catch (e) {
            global.log(e, 'createZipInLocalServer error');
            reject(e);
        }
    });
}
const localCheckinJson = (payload) => {
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            // const data = querystring.stringify({
            //     docId: path,
            // });
            const docProp = await post(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localcheckinJson}`,payload, headers);
            resolve(docProp);
        } catch (e) {
            global.log(e, 'getlocalChecksum error');
            reject(e);
        }
    });
}



module.exports = {
    getlocalChecksum,
    uploadlocalExistingFile,
    uploadlocalNewFile,
    downloadlocalFile,
    deletelocalFile,
    downloadreorderlocalFile,
    islocalFileExist,
    localcopyFile,
    downloadlocalFileURL,
    getRetreivelocalFilesURL,
    httpDownload,
    downloadLocalFileWithImpersonator,
    uploadlocalExistingFileWithImpersonator,
    uploadlocalNewFileWithImpersonator,
    downloadBlobFilestoZip,
    localCheckinJson,
    createZipInLocalServer,
    validateUploadedFile
};