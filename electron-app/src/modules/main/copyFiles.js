const { retreiveLocalFiles, extendedJoin, getFormattedName, copyFile, hasFileModified, writeSmallFile,readSmallFile, getFormattedParams, getParamsPair, getParamsValue,CopyWithImpersonator,isPathExist } = require('../utils/io');
const micromatch = require('micromatch');
const globParent = require('glob-parent');
const { basename, dirname,join } = require('path');
const request = require('request');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { GetAllFiles } = require('../../modules/main/postProcessing/onSaveValidation');


exports.copyIOFiles = async (fileList, copyModifiedFilesOnly = false) => { 
    for (let i = 0; i < fileList.length; i++) {
        let { src, dest, content, hasFileChanged } = fileList[i];
        if (content) {
            await writeSmallFile(dest, content);
        } else {
            if (copyModifiedFilesOnly) {
                if (hasFileChanged) {
                    await copyFile(src, dest);
                } else {
                    global.log('skipped file', src, dest);
                }
            } else {
                await copyFile(src, dest);
            }
        }
    }
}

function validURL(str) {
    var pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
        '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
        '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
        '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
    return !!pattern.test(str);
}

exports.copyIOFilesWithImpersonator = async (fileList, copyModifiedFilesOnly = false,clientUtility) => {
    let files = [];
    for (let i = 0; i < fileList.length; i++) {
        let { src, dest, content, hasFileChanged, isFolder } = fileList[i];
        if (content) {
            await writeSmallFile(dest, content);
        } else {
            if (copyModifiedFilesOnly) {
                if (hasFileChanged) {
                    files.push({
                        "isFolder": isFolder || false,
                        "InPath": src,
                        "OutPath": dest,
                        "isDownload": validURL(src)
                    });
                } else {
                    global.log('skipped file', src, dest);
                }
            } else {
                files.push({
                    "isFolder": false,
                    "InPath": src,
                    "OutPath": dest,
                    "isDownload": validURL(src)
                });
            }
        }
    }
    if (files.length > 0) {
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        let response = await _promisifiedRequest({
            url: `${APIConfig.server.getBaseURL()}${APIConfig.server.utils.Impersonator}`,
            method: 'GET',
            gzip: true,
            headers: headers
        });
        let UserData = JSON.parse(Buffer.from((response.body), 'base64').toString('ascii'));
        await CopyWithImpersonator(files, UserData.userName, UserData.Password,clientUtility);
    }
}



const _promisifiedRequest = function (options) {
    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if (response) {
                return resolve(response);
            }
            if (error) {
                return reject(error);
            }
        });
    });
};

exports.promisifiedRequest = _promisifiedRequest;

exports.fetchFileCopyDetails = async (io, clientUtility, filesDataInfo) => {
    const fileStatus = {
        files: [],
        params: [],
        missedFileType: [],
        missedFile: []
    };
    for (let i = 0; i < io.length; i++) {
        let { name,src, dest, content,fileTypes } = io[i];
        if(name){
            io[i].src = { name, typeId: fileTypes };
            io[i].dest = "";
            src = io[i].src;
            dest = "";
        }
        if (content) {
            if (Object.prototype.toString.call(dest) == '[object String]') {
                await fetchContentFiles(io[i], clientUtility, filesDataInfo, fileStatus);
            } else {
                throw 'Dest should be string for content source';
            }
        } else if (Object.prototype.toString.call(src) == '[object String]' && Object.prototype.toString.call(dest) == '[object String]') {
            await fecthIOFileCopyDetails(io[i], clientUtility, filesDataInfo, fileStatus);
        } else if (Object.prototype.toString.call(src) == '[object Object]' && Object.prototype.toString.call(dest) == '[object String]') {
            await fetchSrcBasedFileCopyDetails(io[i], clientUtility, filesDataInfo, fileStatus);
        } else if (Object.prototype.toString.call(src) == '[object String]' && Object.prototype.toString.call(dest) == '[object Object]') {
            await fetchDestBasedFileCopyDetails(io[i], clientUtility, filesDataInfo, fileStatus);
        } else {
            throw 'src / dest has been missmatched';
        }
    }
    return fileStatus;
}

const fetchContentFiles = (ioFile, clientUtility, filesDataInfo, fileStatus) => {
    return new Promise(async (resolve, reject) => {
        try {
            let { dest: destPath, content, params } = ioFile;
            params = getParamsPair(params);
            destPath = destPath.replace(new RegExp(/\\/, 'g'), '/');
            const formettedContent = getFormattedName(content, clientUtility.activityDetails.placeHolders);
            fileStatus.files.push({ content: formettedContent, dest: destPath, hasFileChanged: true });
            if (params) {
                const _params = getFormattedParams(params, { ...clientUtility.activityDetails.placeHolders, __FILE__: extendedJoin([destPath]) });
                fileStatus.params = [...fileStatus.params, ..._params];
            }
            resolve(fileStatus);
        } catch (e) {
            global.log(e, 'getContentFile error');
            reject(e);
        }
    });
}

const fetchSrcBasedFileCopyDetails = (ioFile, clientUtility, filesDataInfo, fileStatus) => {
    return new Promise(async (resolve, reject) => {
        try {
            let { src: ioSrcFile, dest: ioDestFile, params } = ioFile;
            if(params == undefined){
                params = clientUtility.activityDetails.toolsConfig.tools[clientUtility.activityDetails.selectedTool]?.params;
            }
            params = getParamsPair(params);
            ioDestFile = ioDestFile ? ioDestFile.replace(new RegExp(/\\/, 'g'), '/') : '';
            const lwfDetails = ioSrcFile.lwf && ioSrcFile.lwf.src ? {
                src: ioSrcFile.lwf.src, isRoot: !!ioSrcFile.lwf.isRoot
            } : { src: '', isRoot: false };
             const fTypeName = ioSrcFile.fileTypeName; // || ioSrcFile.name;
            const inputFileTypeId = ioSrcFile.typeId instanceof Array ? ioSrcFile.typeId : [ioSrcFile.typeId];
            const formattedFTypeName = fTypeName ? getFormattedName(fTypeName, clientUtility.activityDetails.placeHolders) : '';
            const formattedFTypeNameRegex = new RegExp(formattedFTypeName);
            const filteredfileDetails = filesDataInfo.filter(fd => {
                const formattedFTypeNameResult = fd.name.match(formattedFTypeNameRegex);
                // const isTypeNameMatched = (!fTypeName.includes(';') ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                const isTypeNameMatched = (fTypeName ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                return inputFileTypeId.includes(parseInt(fd.typeId)) && isTypeNameMatched &&
                    ((clientUtility.activityDetails.fileType.fileId && fd.allowSubFileType) ? fd.incomingFileId == clientUtility.activityDetails.fileType.fileId : true)
            });
            for (let j = 0; j < filteredfileDetails.length; j++) {
                const { name: fileTypeName, typeId, incomingFileId, pageRange } = filteredfileDetails[j];
                const folderStructure = extendedJoin([clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([clientUtility.pathDetails.client.path, '/']);
                const excludedFiles = [];
                filesDataInfo.forEach((data) => {
                    if (fileTypeName != data.name) excludedFiles.push(extendedJoin([clientUtility.pathDetails.client.path, data.name, '**', '*']));
                });
                const piivalue = (
                    (clientUtility.activityDetails.placeHolders.ArticleTypeList || [])
                      .filter(x => x.FileTypeName == fileTypeName)
                      .pop() || {}
                  ).piinumber;
                clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders ,IssuePII : piivalue}
                
                let formattedName = getFormattedName(lwfDetails.src ? lwfDetails.src : ioSrcFile.name, { ...clientUtility.activityDetails.placeHolders, FileTypeName: fileTypeName, PageRange: pageRange }).replace(new RegExp(/\\/, 'g'), '/');
                // let filePath = extendedJoin([(lwfDetails.src && lwfDetails.isRoot) ? folderStructureWithRoot : folderStructure, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                // let filePath = Object.keys(clientUtility.activityDetails.customer).length >0 && clientUtility.activityDetails.customer.id == '1' ? extendedJoin([folderStructureWithRoot, formattedName]).replace(new RegExp(/\\/, 'g'), '/') : extendedJoin([(lwfDetails.src && lwfDetails.isRoot) ? folderStructureWithRoot : folderStructure, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                let regExp = '[a-zA-Z\\-\\_]+'
                let splittedName = formattedName.split('*')
                if (formattedName.includes('*')) {
                    var formattedFileName = formattedName.replace('*', regExp);
                    formattedFileName = formattedFileName.replace("/", "\\\\")
                    var regex = new RegExp(formattedFileName, "g")
                    if (isPathExist(folderStructureWithRoot)) {
                        var compath = await GetAllFiles(folderStructureWithRoot)
                        for (var h = 0; h < compath.length; h++) {
                            var patternedName = regex.test(compath[h])
                            if (compath[h].includes(splittedName[0]) && patternedName) {
                                formattedName = basename(compath[h]);
                            }
                        }
                    }
                }
                let filePath = extendedJoin([folderStructureWithRoot, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                filePath = filePath[filePath.length - 1] == '/' ? (filePath + '*') : filePath;
                const retreivedFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), excludedFiles);
                const srcFiles = micromatch(retreivedFiles, filePath).map(file => extendedJoin([file]));
                const formattedDest = ioDestFile ? getFormattedName(ioDestFile, { ...clientUtility.activityDetails.placeHolders, FileTypeName: fileTypeName, PageRange: pageRange }).replace(new RegExp(/\\/, 'g'), '/') : '';
                const formattedSrc = filePath;
                for (let k = 0; k < srcFiles.length; k++) {
                    const srcFile = extendedJoin([srcFiles[k]], false);
                    if (ioDestFile) {
                        const destFileName = formattedDest[formattedDest.length - 1] == '/' ? basename(srcFile) : basename(formattedDest);
                        const destFolderName = formattedDest.includes('/') ? (formattedDest[formattedDest.length - 1] === '/' ? formattedDest : dirname(formattedDest) + '/') : '';
                        const relativeSrcPath = srcFile.split(globParent(formattedSrc) === '.' ? '' : (globParent(formattedSrc) + '/'))[1];
                        if (!relativeSrcPath) throw 'Intermediate path is undefined';
                        const destIntermediatePath = relativeSrcPath.includes('/') ? dirname(relativeSrcPath) + '/' : '';
                        const destPath = destFolderName + destIntermediatePath + destFileName;
                        const hasFileChanged = await hasFileModified(srcFile, destPath);
                        fileStatus.files.push({ src: srcFile, dest: destPath, hasFileChanged });
                        if (params) {
                            const _params = getFormattedParams(params, { ...clientUtility.activityDetails.placeHolders, __FILE__: extendedJoin([destPath]) });
                            fileStatus.params = [...fileStatus.params, ..._params];
                        }
                    } else {
                        if (params) {
                            const _params = getFormattedParams(params, { ...clientUtility.activityDetails.placeHolders,FileTypeName: fileTypeName, __FILE__: extendedJoin([srcFile]) });
                            fileStatus.params = [...fileStatus.params, ..._params];
                        }
                    }
                }
                if (srcFiles.length == 0) fileStatus.missedFile.push({ srcName: formattedName, typeId, fileId: incomingFileId })
            }
            if (filteredfileDetails.length == 0) fileStatus.missedFileType.push({ srcName: getFormattedName(ioSrcFile.name, clientUtility.activityDetails.placeHolders), typeId: inputFileTypeId });
            resolve(fileStatus);
        } catch (e) {
            global.log(e, 'copyInputFiles error');
            reject(e);
        }
    });
}

const fetchDestBasedFileCopyDetails = (ioFile, clientUtility, filesDataInfo, fileStatus) => {
    return new Promise(async (resolve, reject) => {
        try {
            let { src: ioSrcFile, dest: ioDestFile, params } = ioFile;
            params = getParamsPair(params);
            ioSrcFile = ioSrcFile.replace(new RegExp(/\\/, 'g'), '/');
            const lwfDetails = ioDestFile.lwf && ioDestFile.lwf.src ? {
                src: ioDestFile.lwf.src, isRoot: !!ioDestFile.lwf.isRoot
            } : { src: '', isRoot: false };
            const fTypeName = ioDestFile.fileTypeName;
            const inputFileTypeId = ioDestFile.typeId instanceof Array ? ioDestFile.typeId : [ioDestFile.typeId];
            const formattedFTypeName = fTypeName ? getFormattedName(fTypeName, clientUtility.activityDetails.placeHolders) : '';
            const formattedFTypeNameRegex = new RegExp(formattedFTypeName);
            const filteredfileDetails = filesDataInfo.filter(fd => {
                const formattedFTypeNameResult = fd.name.match(formattedFTypeNameRegex);
                const isTypeNameMatched = (fTypeName ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                return inputFileTypeId.includes(parseInt(fd.typeId)) && isTypeNameMatched &&
                    ((clientUtility.activityDetails.fileType.fileId && fd.allowSubFileType) ? fd.incomingFileId == clientUtility.activityDetails.fileType.fileId : true)
            });
            for (let j = 0; j < filteredfileDetails.length; j++) {
                const { name: fileTypeName, typeId, incomingFileId, pageRange } = filteredfileDetails[j];
                const folderStructure = extendedJoin([clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([clientUtility.pathDetails.client.path, '/']);
                const excludedFiles = [];
                filesDataInfo.forEach((data) => {
                    if (fileTypeName != data.name) excludedFiles.push(extendedJoin([clientUtility.pathDetails.client.path, data.name, '**', '*']));
                });
                const formattedName = getFormattedName(lwfDetails.src ? lwfDetails.src : ioDestFile.name, { ...clientUtility.activityDetails.placeHolders, FileTypeName: fileTypeName, PageRange: pageRange });
                // let filePath = extendedJoin([(lwfDetails.src && lwfDetails.isRoot) ? folderStructureWithRoot : folderStructure, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                // let filePath = Object.keys(clientUtility.activityDetails.customer).length >0 && clientUtility.activityDetails.customer.id == '1'  ? extendedJoin([folderStructureWithRoot,formattedName]).replace(new RegExp(/\\/, 'g'), '/') : extendedJoin([(lwfDetails.src && lwfDetails.isRoot) ? folderStructureWithRoot : folderStructure, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                let filePath = extendedJoin([folderStructureWithRoot, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                let formattedSrc = getFormattedName(ioSrcFile, { ...clientUtility.activityDetails.placeHolders, FileTypeName: fileTypeName, PageRange: pageRange }).replace(new RegExp(/\\/, 'g'), '/');
                formattedSrc = formattedSrc[formattedSrc.length - 1] == '/' ? (formattedSrc + '*') : formattedSrc;
                const srcFiles = await retreiveLocalFiles(formattedSrc);
                let formattedDest = filePath;
                for (let k = 0; k < srcFiles.length; k++) {
                    const srcFile = extendedJoin([srcFiles[k]], false);
                    const destFileName = formattedDest[formattedDest.length - 1] == '/' ? basename(srcFile) : basename(formattedDest);
                    const destFolderName = formattedDest.includes('/') ? (formattedDest[formattedDest.length - 1] === '/' ? formattedDest : dirname(formattedDest) + '/') : '';
                    const relativeSrcPath = srcFile.split(globParent(formattedSrc) === '.' ? '' : (globParent(formattedSrc) + '/'))[1];
                    if (!relativeSrcPath) throw 'Intermediate path is undefined';
                    const destIntermediatePath = relativeSrcPath.includes('/') ? dirname(relativeSrcPath) + '/' : '';
                    const destPath = destFolderName + destIntermediatePath + destFileName;
                    const hasFileChanged = await hasFileModified(srcFile, destPath);
                    fileStatus.files.push({ src: srcFile, dest: destPath, hasFileChanged });
                    if (params) {
                        const _params = getFormattedParams(params, { ...clientUtility.activityDetails.placeHolders, __FILE__: extendedJoin([destPath]) });
                        fileStatus.params = [...fileStatus.params, ..._params];
                    }
                }
            }
            resolve(fileStatus);
        } catch (e) {
            global.log(e, 'copyInputFiles error');
            reject(e);
        }
    });
}

const fecthIOFileCopyDetails = (ioFile, clientUtility, filesDataInfo, fileStatus) => {
    return new Promise(async (resolve, reject) => {
        try {
            let { src, dest, params } = ioFile;
            params = getParamsPair(params);
            src = src.replace(new RegExp(/\\/, 'g'), '/');
            dest = dest.replace(new RegExp(/\\/, 'g'), '/');
            let srcOptions = {}, destOptions = {}, destinationPaths = [], srcPaths = [];
            src = getFormattedName(src, clientUtility.activityDetails.placeHolders, srcOptions);
            dest = getFormattedName(dest, clientUtility.activityDetails.placeHolders, destOptions);
            if (destOptions.hasMultiple) {
                destOptions.paths.forEach(dst => {
                    destinationPaths.push(dst.replace(new RegExp(/\\/, 'g'), '/'));
                });
            }
            else {
                destinationPaths.push(dest.replace(new RegExp(/\\/, 'g'), '/'));
            }
            if (srcOptions.hasMultiple) {
                srcOptions.paths.forEach(s => {
                    srcPaths.push(s.replace(new RegExp(/\\/, 'g'), '/'));
                });
            }
            else {
                srcPaths.push(src.replace(new RegExp(/\\/, 'g'), '/'));
            }
            srcPaths = srcPaths.map(x => x[x.length - 1] == '/' ? (x + '*') : x);
            let srcFiles = [];
            for (let index = 0; index < srcPaths.length; index++) {
                const srcPathFiles = await retreiveLocalFiles(srcPaths[index]);
                for (let j = 0; j < destinationPaths.length; j++) {
                    let dst = destinationPaths[j];
                    let _fileStatus = { files: [], params: [] }
                    for (let i = 0; i < srcPathFiles.length; i++) {
                        const srcFile = srcPathFiles[i];
                        const destFileName = dst[dst.length - 1] == '/' ? basename(srcFile) : basename(dst);
                        const destFolderName = dst.includes('/') ? (dst[dst.length - 1] === '/' ? dst : dirname(dst) + '/') : '';
                        const relativeSrcPath = srcFile.split(globParent(srcPaths[index]) === '.' ? '' : (globParent(srcPaths[index]) + '/'))[1];
                        if (!relativeSrcPath) throw 'Intermediate path is undefined';
                        const destIntermediatePath = relativeSrcPath.includes('/') ? dirname(relativeSrcPath) + '/' : '';
                        const destPath = destFolderName + destIntermediatePath + destFileName;
                        const hasFileChanged = await hasFileModified(srcFile, destPath);
                        _fileStatus.files.push({ src: srcFile, dest: destPath, hasFileChanged });
                        if (params.length >0) {
                            const _params = getFormattedParams(params, { ...clientUtility.activityDetails.placeHolders, __FILE__: extendedJoin([destPath]) });
                            _fileStatus.params = [..._fileStatus.params, ..._params];
                        }    
                    }
                    if (_fileStatus.files.length == 1 ||
                        (_fileStatus.files.filter(x => x.hasFileChanged).length < (_fileStatus.files.length/2)  &&
                        _fileStatus.files.filter(x => x.hasFileChanged).length < 100)) {
                        fileStatus.files = [...fileStatus.files, ..._fileStatus.files];
                        fileStatus.params = [...fileStatus.params, ..._fileStatus.params];
                    }
                    else if(_fileStatus.files.length == 0 ) {
                        const hasFileChanged = await hasFileModified(srcPaths[index], dst);
                        fileStatus.files.push({ src: srcPaths[index], dest: dst, hasFileChanged : hasFileChanged, isFolder : false })
                    }
                    else {
                        fileStatus.files.push({ src: srcPaths[index], dest: dst, hasFileChanged : true, isFolder : true })
                    }
                }
            }
            resolve(fileStatus);
        } catch (e) {
            global.log(e, 'copySupportingFiles error');
            reject(e);
        }
    });
}

exports.copyDependanceFiles = async (fileList, clientUtility) => {
    const latestFileDetails= await fetchLatestFileNameForTool(clientUtility?.activityDetails?.workOrderId)
    for (let i = 0; i < fileList.length; i++) {
        let { src, dest } = fileList[i];
        let iniFile = basename(src)
        if(iniFile == 'BITS_Book_Details_CUP.ini')
        {
            let date_format = new Date()
            let date = ("0" + date_format.getDate()).slice(-2);
            let month = ("0" + (date_format.getMonth() + 1)).slice(-2);
            let year = date_format.getFullYear();
            let currentDate = year+month+date

            const activityDetails = clientUtility.activityDetails
            const lastFileName=latestFileDetails
      
            let metaRegexp = new RegExp(/(?<=\-)\d+$/);
            let match = metaRegexp.exec(lastFileName);
            let ePage = match[0]
        console.log("oooooooo", match[0]);
            let prdNo = activityDetails.stage.id == 1 ? 1 : activityDetails.placeHolders.StageIteration == 1? 2 : activityDetails.placeHolders.StageIteration + 1
            // let content = join(process.env.Base_path,'src/modules/template/dlnXmlCreation.ini')
             let content = dest;
            const xmlTmplate = await readSmallFile(content);
            const xml = xmlTmplate.replace(/{ISBN}/, activityDetails.placeHolders.ISBN).replace(/{bcode}/, activityDetails.placeHolders.BookCode).replace(/{country}/, activityDetails.placeHolders.CountryCode)
            .replace(/{stage}/, activityDetails.stage.id == 1? 'proof' : 'final').replace(/{date}/, currentDate).replace(/{prdno}/,prdNo ).replace(/{csmail}/,activityDetails.pmEmail).replace(/{csname}/,activityDetails.pmName ).replace(/{epage}/,ePage)
           
            await writeSmallFile(dest, xml);
            return true
    }
    }
};

const  fetchLatestFileNameForTool = (workOrderId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const activityPayloadForLatestFile = {
                woID: workOrderId
            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const fileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getLastFileName}`, activityPayloadForLatestFile, headers);
            resolve( fileDetails && fileDetails.newFileName ? fileDetails.newFileName : '');
        } catch (err) {
            reject(err);
        }
    });
}
