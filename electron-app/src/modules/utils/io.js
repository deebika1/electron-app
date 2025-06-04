const { promises, existsSync, readFileSync } = require('fs');
const { join, resolve, dirname,basename } = require('path');
const micromatch = require('micromatch');
const globParent = require('glob-parent');
const fsExtra = require('fs-extra');
const { APIConfig } = require('../../config/api');
const { post } = require('../http/index');
const { config } = require('../../config/index');
const {readdirSync,statSync} = require("fs");
const path = require('path');
const { CopyFilesPowerShellCommand } = require("./CopyFilesPowerShellCommand");
const { BlobServiceClient } = require('@azure/storage-blob');


const copyFile = (source, destination) => {
    return new Promise(async (resolve, reject) => {
        try {
            source = source.replace("/**/*","").replace("/*","")
            destination = destination.replace("/**/*","").replace("/*","")
            if (clientUtility) {
                await clientUtility.updateStatusToServer({ message: `Copying file - ${destination}`, progress: 40 }, 2);
            }
            await fsExtra.copy(source, destination, { overwrite: true });
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

const CopyWithImpersonator = (files, userName, Password,clientUtility) => {
    return new Promise(async (resolve, reject) => {
        // let Copy = edge.func({
        //     assemblyFile: path.join(process.env.dir, '.\\dlls\\CopyWithImpersonator.dll'),
        //     typeName: "CopyWithImpersonator.Method",
        //     methodName: "CopyWithImpersonator"
        // });
        // let out = Copy(JSON.stringify({
        //     "Credentials": { "Username": userName, "Domain": "INTEGRA-INDIA.COM", "Password": Password },
        //     "FileInfos": files
        // }), true);
        // out = JSON.parse(out);
        // out.isSuccess ? resolve() : reject(out.Message);
        try {
            for (let index = 0; index < files.length; index++) {
                var file = files[index];
                file.InPath = file.InPath.replace("/**/*","").replace("/*","").split("\\").join("/");                
                file.OutPath = file.OutPath.replace("/**/*","").replace("/*","").split("\\").join("/")
                if (clientUtility) {
                    await clientUtility.updateStatusToServer({ message: `Copying file integrafs2 ${basename(file.OutPath)}`, progress: 40 }, 2);
                }
                await CopyFilesPowerShellCommand(file, { "Username": userName, "Domain": "INTEGRA-INDIA.COM", "Password": Password });
            }
            resolve(true);
        } catch (error) {
            reject(error);
        }
    });
}

const makeDir = async (path) => {
    return promises.mkdir(path, { recursive: true });
}

const readDir = async (path) => {
    return promises.readdir(path);
}

const rename = async (oldPath, newPath) => {
    return promises.rename(oldPath, newPath);
}

const removeFile = async (path) => {
    return promises.unlink(path);
}

const removeDir = async (path) => {
    return promises.rmdir(path);
}

const stat = async (path) => {
    return promises.lstat(path);
}

const resolveToWinPath = (path) => {
    return path.replace(/\//g, '\\');
}

const resolveToNormalPath = (path) => {
    return path.replace(/\\/g, '/');
}
const hasFileModified = async (src, dest) => {
    if (isPathExist(dest)) {
        const srcFileDetails = await stat(src);
        const destFileDetails = await stat(dest);
        return srcFileDetails.mtime.toJSON() != destFileDetails.mtime.toJSON()
    } else {
        return true;
    }
}

const getAllFiles = async (path, recursive = true) => {
    if (await isDirExist(path)) {
        const dirents = await promises.readdir(path, { withFileTypes: true });
        const files = await Promise.all(dirents.map((dirent) => {
            const res = resolve(path, dirent.name);
            if (recursive) {
                return dirent.isDirectory() ? getAllFiles(res, recursive) : res;
            } else {
                return dirent.isDirectory() ? 'Dir' : res;

            }
        }));
        if (recursive) {
            return Array.prototype.concat(...files);
        } else {
            return Array.prototype.concat(...files.filter((fi => fi != 'Dir')));
        }

    } else {
        return Array.prototype.concat(...[]);
    }
}

const retreiveLocalFiles = async (folder, exclude = []) => {
    folder = folder.replace(new RegExp(/\\/, 'g'), '/');
    folder = (folder[folder.length - 1] == '/' ? (folder + '*') : folder);
    const formattedFolder = globParent(folder) + '/';
    const isRecursive = folder.includes('**');
    const retreivedFiles = await getAllFiles(formattedFolder, isRecursive);
    let matchedFiles = micromatch(retreivedFiles, folder,{ nocase: true });
    if (exclude.length) {
        matchedFiles = excludeFiles(matchedFiles, exclude);
    }
    return matchedFiles
}

const retreiveFiles = async (folder) => {
    folder = folder.replace(new RegExp(/\\/, 'g'), '/');
    folder = (folder[folder.length - 1] == '/' ? (folder + '*') : folder);
    const formattedFolder = globParent(folder) + '/';
    const retreivedFiles = await getAllFiles(formattedFolder);
    const matchedFiles = micromatch(retreivedFiles, folder);
    return matchedFiles
}

const  getRevisedFileInfoE2E = async (payload) => {
    return new Promise(async (resolve,reject) =>{
    try{
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        let revisesFileInfo = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getRevisedFileInfoE2E}`, payload, headers);
        resolve(revisesFileInfo)

    }catch(error){
       reject(error)
    }
    })
}


const excludeFiles = (files, exclude) => {
    let matchedFiles = micromatch(files, exclude.map(fi => fi.replace(new RegExp(/\\/, 'g'), '/')));
    files = files.filter(file => !matchedFiles.includes(file))
    return files;
}

const isDirExist = async (path) => {
    const isPathExist = existsSync(path);
    if (isPathExist && (await stat(path)).isDirectory()) {
        return true;
    }
    return false;
}

const isPathExist = (path) => {
    return existsSync(path);
}

const extendedJoin = (paths, isBackwardSlash = true) => {
    if (isBackwardSlash) return join(...paths);
    return join(...paths).replace(/\\/g, '/')
}

const readSmallFile = (path, encoding = 'utf-8') => {
    return new Promise(async (resolve, reject) => {
        try {
            const fileSize = (await stat(path)).size;
            const fileSizeInKB = fileSize / 1000;
            if (fileSizeInKB < 5000) {
                const fileContent = await promises.readFile(path, { encoding });
                resolve(fileContent);
            } else {
                reject(`File exceeds maximum limit (max - 1MB)`);
            }
        } catch (err) {
            reject(err);
        }
    });
}

const writeSmallFile = (path, content) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fileSize = Buffer.byteLength(content, 'utf8')
            const fileSizeInKB = fileSize / 5000;
            if (fileSizeInKB < 5000) {
                await makeDir(dirname(path));
                const fileContent = await promises.writeFile(path, content, { encoding: 'utf8' });
                resolve(fileContent);
            } else {
                reject(`File exceeds maximum limit (max - 5MB)`);
            }
        } catch (err) {
            reject(err);
        }
    });
}

const getFormattedName = (unFormattedName, placeHolders, refOptions = {}) => {
    const pattern = ';{{placeholder}};';
    const placeHolderkeys = Object.keys(placeHolders);
    let formattedName = unFormattedName;
    for (let i = 0; i < placeHolderkeys.length; i++) {
        const placeHolder = placeHolders[placeHolderkeys[i]] ? placeHolders[placeHolderkeys[i]] : `{{${placeHolderkeys[i]}}}`;
        if (typeof placeHolder != "string" && placeHolder.length > 0) {
            if (formattedName.includes(placeHolderkeys[i])) {
                refOptions.hasMultiple = true;
                refOptions.paths = [];
                placeHolder.forEach(ele => {
                    refOptions.paths.push(formattedName.replace(new RegExp(pattern.replace(/{{placeholder}}/, placeHolderkeys[i]), 'g'), ele))
                })
            }
        } else {
            formattedName = formattedName.replace(new RegExp(pattern.replace(/{{placeholder}}/, placeHolderkeys[i]), 'g'), placeHolder);
        }
    }
    return formattedName;
}

const getFormattedParams = (params, placeHolders) => {
    params = params ? params : [];
    params = params instanceof Array ? params : [params];
    return params.map((par) => {
        return { value: getFormattedName(par.value, placeHolders), weightage: par.weightage };
    });
}

const getParamsPair = (params) => {
    params = params ? params : [];
    params = params instanceof Array ? params : [params];
    return params.map((par) => {
        return { value: par.value || par || '', weightage: isNaN(par.weightage) ? -1 : parseInt(par.weightage) };
    });
}

const getParamsValue = (params) => {
    params = params ? params : [];
    return params.sort((obj1, obj2) => {
        return obj2.weightage - obj1.weightage;
    }).map(par => par.value);
}

const isFileExistOKM = (path) => {
    console.log("path for file exists",path)
    const isFileExist = APIConfig.uri.isFileExist;
    return new Promise(async (resolve, reject) => {
        try {
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const fileExistDetails = await post(`${APIConfig.server.getBaseURL()}${isFileExist}`, { path }, headers);
            if (fileExistDetails.isExist) {
                // await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.deleteFile}`, { uuid: fileExistDetails.uuid }, headers);
            }
            resolve(fileExistDetails);
        } catch (e) {
            global.log(e, 'deleteFile error');
            reject(e);
        }
    });
}

const createFileTypeFolderStructure = ({ type, du, customer, workOrderId, service, stage, activity, fileType }) => {
    return new Promise(async (resolve, reject) => {
        try {
            const name = await getFileTypeFolderStructure({ type, du, customer, workOrderId, service, stage, activity, fileType });
            const uuid = await createFolder(name);
            resolve({ name, uuid });
        } catch (e) {
            reject(e);
        }
    });
}
 const getFileTypeFolderStructure = ({ type, du, customer, workOrderId, service, stage, activity, fileType, template }) => {
    const url = APIConfig.uri.getFolderPath;
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    const data = {
        type, du, customer, workOrderId, service, stage, activity, fileType, template
    };
    return new Promise(async (resolve, reject) => {
        try {
            const folderStructure = await post(`${APIConfig.server.getBaseURL()}${url}`, data, headers);
            resolve(folderStructure);
        } catch (err) {
            reject(err);
        }
    });
}


const  getFormattedGraphicPath =(customerDetails) => {
    return new Promise(async (resolve,reject) =>{
    try{
        const filePayload = {
            duid: customerDetails.du.id,
            customerid:customerDetails.customer.id
            ,placeHolders: customerDetails.placeHolders
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { correctpath } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFormattedGraphicPath}`, filePayload, headers);
        resolve(correctpath)

    }catch(error){
       reject(error)
    }
    })
}

const  checkToolSuccess =(payload) => {
    return new Promise(async (resolve,reject) =>{
    try{
      
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const correctpath = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.skipOnceSuccessTool}`, payload, headers);
        resolve(correctpath)

    }catch(error){
       reject(error)
    }
    })
}

const createFolder = (folderName) => {
    const url = APIConfig.uri.createFolder;
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    const data = { folderName };
    return new Promise(async (resolve, reject) => {
        try {
            const response = await post(`${APIConfig.server.getBaseURL()}${url}`, data, headers);
            global.log('folder created ' + folderName);
            resolve(response);
        } catch (err) {
            global.log('createFolder error' + folderName);
            reject(err);
        }
    });
}
 const removeFolder = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (isPathExist(path)) {
                const dirPaths = await readDir(path);
                for (let i = 0; i < dirPaths.length; i++) {
                    const currentPath = join(path, dirPaths[i]);
                    const fstat = await stat(currentPath);
                    if (fstat.isDirectory()) {
                        await removeFolder(currentPath);
                    } else {
                        try {
                            await removeFile(currentPath);
                        } catch (e) {
                            console.log(e, 'removeFolder');
                            reject(e);
                        }
                    }
                }
                try {
                    await removeDir(path);
                } catch (e) {
                    console.log(e, 'removeFolder');
                    reject(e);
                }
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

const copyTemplateFile = ({ src, dest, name, destBasePath, dmsType }) => {
    const url = APIConfig.uri.copyFile;
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    const data = { src, dest, name, destBasePath, dmsType };
    return new Promise(async (resolve, reject) => {
        try {
            const response = await post(`${APIConfig.server.getBaseURL()}${url}`, data, headers);
            global.log(`Copied file`, src, dest, name, destBasePath);
            resolve(response);
        } catch (err) {
            global.log(`copyFile error`, src, dest, name, destBasePath);
            reject(err);
        }
    });
}


const  getS3UploadDetails = (workOrderId,logHistoryPayload) =>  {
    return new Promise(async (resolve,reject) =>{
        try{
            const payload ={
                workOrderId,
                logHistoryPayload
            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
           const data = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getS3UploadDetails}`, payload, headers);
           resolve(data)
        }catch(error){
            reject(`Get S3 file details error: ${JSON.stringify(error)}`);
        }
    });
}

const  uploadS3Payload = (clientUtility,toolsConfig) =>  {    
    return new Promise(async (resolve,reject) =>{
        try{
            let inputConfig = toolsConfig.filter((list) => list.isS3Upload);
            for (let i = 0; i < inputConfig.length; i++) {
                let inputFile =  getFormattedName(inputConfig[i].name, clientUtility.activityDetails.placeHolders) ;
                const folderStructureWithRoot = extendedJoin([clientUtility.pathDetails.client.path, '/']);
                let filePath = extendedJoin([folderStructureWithRoot, inputFile ]).replace(new RegExp(/\\/, 'g'), '/');
                 const localFolderName = basename(filePath);
                 const fileContent = readFileSync(filePath, { encoding: 'utf8' });
                 console.log(fileContent, "fileContents");
                 const payloadData = JSON.parse(fileContent);
     
                 const payload ={
                    workOrderId : clientUtility.activityDetails.workOrderId,
                     payloadData
                 }
                 const headers = {
                     'Authorization': `Bearer ${config.server.getToken()}`
                 };
                const data = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.uploadS3Payload}`, payload, headers);
                resolve(data);              
            };
         
        }catch(error){
            reject(`Upload S3 payload error: ${JSON.stringify(error)}`);
        }
    });
}
module.exports = {
    copyFile,
    CopyWithImpersonator,
    makeDir,
    removeFile,
    removeDir,
    isPathExist,
    isDirExist,
    stat,
    rename,
    retreiveLocalFiles,
    readDir,
    extendedJoin,
    readSmallFile,
    writeSmallFile,
    getFormattedName,
    getFormattedParams,
    getParamsPair,
    getParamsValue,
    hasFileModified,
    isFileExistOKM,
    createFileTypeFolderStructure,
    getFileTypeFolderStructure,
    createFolder,
    removeFolder,
    copyTemplateFile,
    readdirSync,
    statSync,
    resolveToWinPath,
    resolveToNormalPath,
    getRevisedFileInfoE2E,
    getFormattedGraphicPath,
    getS3UploadDetails,
    uploadS3Payload,
    retreiveFiles,
    checkToolSuccess
};
