const { isPathExist, readDir, removeFile, removeDir, stat, extendedJoin, getFormattedName } = require('./../utils/io');
const { promises } = require('fs');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { post, get } = require('../../modules/http/index');
const { deleteFile } = require('../utils/okm')
const { GetAllFiles } = require('../../modules/main/postProcessing/onSaveValidation')
const { basename, extname } = require('path');
const { closeExplorer } = require('../utils/explorer');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { DeletePaths } = require("../../config/env.json");
const { exists } = require('fs-extra');
const { DeleteFilesPowerShellCommand } = require('../../modules/utils/CopyFilesPowerShellCommand.js');
const { promisifiedRequest } = require("../../modules/main/copyFiles.js")



class ClearActivity {
    constructor(clientUtility) {
        this.clientUtility = clientUtility;
        this.filesInfo = {
            data: [],
            missedFiles: [],
            requiredFiles: []

        }
    }

    startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.clientUtility.updateStatusToServer({ message: 'Deleting Files', progress: 30 }, 2);
                await closeExplorer(this.clientUtility.pathDetails.client.path);
                if (payload.action == 'cancel' || payload.action == 'hold' || payload.action == 'cancel' || payload.action == 'pending' || payload.action == 'save') {
                    if (this.clientUtility.activityDetails.customer.id == '1') {
                        await this.deletePath();
                    }
                }
                // clear openkm file after it synced
                if (payload.action == 'cancel') {
                    await this.checkBusyFiles(this.clientUtility.pathDetails.client.path)
                    // to be deleted
                    // await this.fetchFileDetails()
                    // var incomingDetails = await this.getIncomingFileTypeDetails(this.clientUtility);
                    // var fileDetails = await this.getFileDetails(incomingDetails, this.filesInfo.data);
                    // await this.clientUtility.updateStatusToServer({ message: 'Deleting Files', progress: 60 }, 2);
                    // await this.getToolsOutputDetails(incomingDetails, this.filesInfo.data);
                    // await this.clientUtility.updateStatusToServer({ message: 'Deleting Files', progress: 80 }, 2);
                    // global.log(fileDetails, 'fileDetailsfileDetails');
                    // var removeFilesInOkm = await this.removeSyncedFiles(fileDetails, this.clientUtility)

                }
                let folderPathsToClear = [];
                folderPathsToClear.push(this.deleteActivityFolder(this.clientUtility.pathDetails.client.tools));
                folderPathsToClear.push(this.deleteActivityFolder(this.clientUtility.pathDetails.client.path));
                await Promise.all(folderPathsToClear);
                await this.clientUtility.updateStatusToServer({ message: 'Deleted Files', progress: 90 }, 2);
                resolve();
            } catch (err) {
                global.log(err, 'ClearActivity');
                reject(err);
            }
        });
    }

    async fetchFileDetails() {
        const filePayload = {
            wfEventId: this.clientUtility.activityDetails.wfEventId,
            placeHolders: this.clientUtility.activityDetails.placeHolders,
            workOrderId: this.clientUtility.activityDetails.workOrderId,
            du: this.clientUtility.activityDetails.du,
            customer: this.clientUtility.activityDetails.customer,
            service: this.clientUtility.activityDetails.service,
            stage: this.clientUtility.activityDetails.stage,
            activity: this.clientUtility.activityDetails.activity,
            softwareId: this.clientUtility.activityDetails.softwareId,
            fileConfig: this.clientUtility.activityDetails.fileConfig,
            iscamundaflow: this.activityDetails.iscamundaflow

        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, validationFileConfig, filesAdditionalInfo } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
        this.filesInfo.missedFiles = filesAdditionalInfo.missedFiles;
        this.filesInfo.requiredFiles = filesAdditionalInfo.requiredFiles;

    }

    async deletePath() {
        return new Promise(async resolve => {
            try {
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                let response = await promisifiedRequest({
                    url: `${APIConfig.server.getBaseURL()}${APIConfig.server.utils.Impersonator}`,
                    method: 'GET',
                    gzip: true,
                    headers: headers
                });
                let UserData = JSON.parse(Buffer.from((response.body), 'base64').toString('ascii'));
                let awts = [];
                DeletePaths.forEach(pth => {
                    if (exists(pth)) {
                        awts.push(DeleteFilesPowerShellCommand(pth, {
                            Domain: "INTEGRA-INDIA.COM",
                            Username: UserData.userName,
                            Password: UserData.Password
                        }).catch(err => { }));
                    }
                })
                await Promise.all(awts);
            } catch (error) {
                console.log(error);
            }
            resolve()
        })
    }

    async checkBusyFiles(path) {
        return new Promise(async (resolve, reject) => {
            try {
                var currentPath;
                if (this.clientUtility.activityDetails.customer.id == '1') {
                    await this.deletePath();
                }
                if (this.clientUtility.activityDetails.customer.id) {
                    try {
                        const dirPaths = await readDir(path);
                        for (let i = 0; i < dirPaths.length; i++) {
                            currentPath = extendedJoin([path, dirPaths[i]]);
                            if (currentPath.includes(dirPaths[i])) {
                                const fileHandle = await promises.rename(currentPath, currentPath);
                            }
                        }
                    } catch (e) {
                        if (e && e.code === 'EBUSY') {
                            const relativeSrc = extendedJoin([currentPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                            reject(`Please close the busy directory E01 (${relativeSrc}).`);
                        } else {
                            reject(e);
                        }
                    }
                    resolve()
                } else {
                    resolve()
                }
            } catch (e) {
                reject(e);
            }
        })
    }
    async deleteActivityFolder(path) {
        return new Promise(async (resolve, reject) => {
            try {
                if (isPathExist(path)) {
                    const dirPaths = await readDir(path);
                    for (let i = 0; i < dirPaths.length; i++) {
                        const currentPath = extendedJoin([path, dirPaths[i]]);
                        const fstat = await stat(currentPath);
                        if (fstat.isDirectory()) {
                            await this.deleteActivityFolder(currentPath);
                        } else {
                            try {
                                await removeFile(currentPath);
                            } catch (e) {
                                global.log(e, 'deleteActivityFolder');
                                if (e && e.code === 'EBUSY') {
                                    const relativeSrc = extendedJoin([currentPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                                    reject(`E01: Please close the busy file (${relativeSrc}).`);
                                } else {
                                    reject(e);
                                }
                            }
                        }
                    }
                    try {
                        await removeDir(path);
                    } catch (e) {
                        global.log(e, 'deleteActivityFolder');
                        if (e && e.code === 'EBUSY') {
                            const relativeSrc = extendedJoin([path], false).replace(this.clientUtility.pathDetails.client.path, '');
                            reject(`Please close the busy directory (${relativeSrc}).`);
                        } else {
                            reject(e);
                        }
                    }
                }
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }


    async getIncomingFileTypeDetails(clientUtility) {
        return new Promise(async (resolve, reject) => {
            try {
                const filePayload = {
                    workOrderId: clientUtility.activityDetails.workOrderId,
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const FileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getIncomingFileType}`, filePayload, headers);
                resolve(FileDetails)
            } catch (e) {
                global.log('error in fetching incoming file details')
                reject(e)
            }
        })
    }

    async deleteTranscationEnteris(clientUtility, repofilepath, formattedSubLikeKey, ext) {
        return new Promise(async (resolve, reject) => {
            try {
                const filePayload = {
                    wfEventId: clientUtility.activityDetails.wfEventId,
                    repoFilePath: repofilepath,
                    formattedSubLikeKey: formattedSubLikeKey,
                    ext: ext
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const FileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.deleteTranscationEnterisForCancel}`, filePayload, headers);
                resolve(FileDetails)
            } catch (e) {
                global.log('error in fetching incoming file details')
                reject(e)
            }
        })
    }


    async getRestoreVersion(sourceDetails, dmsType) {
        return new Promise(async (resolve, reject) => {
            try {
                if (Object.keys(sourceDetails).length > 0 && sourceDetails.okmFilePath != '') {
                    const filePayload = {
                        uuid: sourceDetails.uuid,
                        dmsType: dmsType,
                        path: sourceDetails.Resotorepath
                    };
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    let restoreDetails = []
                    switch (dmsType) {
                        case "azure":
                            let encodedURL = encodeURI(sourceDetails.Resotorepath);
                            encodedURL.replace(/%20/g, ' ').replace(/%25/g, ' ');
                            restoreDetails = await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.blobRoleback}?docId=${encodedURL}`);
                            break;
                        case "local":
                            restoreDetails = []
                            // await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.localRoleback}?docId=${sourceDetails.Resotorepath}`);
                            break;
                        default:
                            restoreDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getRestoreVersion}`, filePayload, headers);
                            break;
                    }
                    resolve(restoreDetails)
                } else {
                    resolve()
                }

            } catch (e) {
                global.log('error in restoring the files')
                reject(e)
            }
        })
    }


    async getPreviousActivitiesForCancel(clientUtility, WfDefId) {
        return new Promise(async (resolve, reject) => {
            try {
                const filePayload = {
                    workOrderId: clientUtility.activityDetails.workOrderId,
                    WfDefId: WfDefId
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const previousDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getPreviousActivitiesForCancel}`, filePayload, headers);
                resolve(previousDetails)

            } catch (e) {
                global.log('error in restoring the files')
                reject(e)
            }
        })
    }


    async getFileDetails(incomingDetails, filesInfo) {
        return new Promise(async (resolve, reject) => {
            try {
                var clearSaveFiles = [];
                console.log(incomingDetails, "incomingDetails")
                let keyFile = '';
                var newInnerArray = [];
                var keysLength = Object.keys(this.clientUtility.activityDetails.fileConfig.fileTypes)
                for (var i = 0; i < keysLength.length > 0; i++) {
                    keyFile = keysLength[i]
                    let file = this.clientUtility.activityDetails.fileConfig.fileTypes[keysLength[i]];
                    if (file && Object.keys(file).length > 0 && file.files && file.files.length > 0) {
                        var innerFile = file.files

                        var innerArray = []
                        for (var j = 0; j < innerFile.length > 0; j++) {
                            console.log(innerFile[j], "innerFile[j]");
                            if ((innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck).length > 0) || innerFile[j].mandatoryCheck) {
                                if ((innerFile[j].mandatoryCheck || (innerFile[j].mandatoryCheck && (innerFile[j].mandatoryCheck.save || innerFile[j].mandatoryCheck.hold || innerFile[j].mandatoryCheck.pending || innerFile[j].mandatoryCheck.reject))) && ('activityIteration' in innerFile[j].mandatoryCheck ? (!(innerFile[j].mandatoryCheck.activityIteration != this.clientUtility.activityDetails.activity.iteration)) : 'previousActivityId' in innerFile[j].mandatoryCheck ? true : true)) {
                                    console.log(innerFile[j])
                                    // to be handled directly
                                    const isInputFile = !!(
                                        (innerFile[j].fileFlowType || []).length == 2 ||
                                        (innerFile[j].fileFlowType || []).filter(x => x.toUpperCase() == 'IN').length > 0
                                    );
                                    innerFile[j].mandatoryCheck.isInputFile = isInputFile;

                                    if ('previousActivityId' in innerFile[j].mandatoryCheck) {
                                        var preivousDefId = innerFile[j].mandatoryCheck.previousActivityId
                                        var previousData = await this.getPreviousActivitiesForCancel(this.clientUtility, preivousDefId)

                                    }
                                    var filteredFileNameAray = incomingDetails.filter((list) => list.filetypeid == keysLength[i]);
                                    var filteredBasePathArray = filesInfo.filter((list) => list.typeId == keysLength[i])
                                    if (filteredFileNameAray.length > 0) {
                                        var fileTypeObj = {}
                                        if (innerFile[j].name.includes('PageRange')) {
                                            var FileTypeName = filteredFileNameAray[0].newfilename
                                            fileTypeObj['PageRange'] = FileTypeName
                                            innerFile[j].formattedName = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.GraphicName ? getFormattedName(innerFile[j].mandatoryCheck.isGraphicFolder.GraphicName, fileTypeObj) : ('isMainFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isMainFolder && innerFile[j].mandatoryCheck.mainName) ? getFormattedName(innerFile[j].mandatoryCheck.mainName, fileTypeObj) : getFormattedName(innerFile[j].name, fileTypeObj)
                                            innerFile[j].formattedSubLikeKey = ('isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.GraphicName) || ('isMainFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isMainFolder && innerFile[j].mandatoryCheck.mainName) ? true : false
                                            innerFile[j].ext = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.ext ? innerFile[j].mandatoryCheck.isGraphicFolder.ext : ''


                                        } else if (innerFile[j].name.includes('FileTypeName') && (!('isPattern' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isPattern))) {
                                            var FileTypeName = filteredFileNameAray[0].filename
                                            fileTypeObj['FileTypeName'] = FileTypeName
                                            innerFile[j].formattedName = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.GraphicName ? getFormattedName(innerFile[j].mandatoryCheck.isGraphicFolder.GraphicName, fileTypeObj) : ('isMainFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isMainFolder && innerFile[j].mandatoryCheck.mainName) ? getFormattedName(innerFile[j].mandatoryCheck.mainName, fileTypeObj) : getFormattedName(innerFile[j].name, fileTypeObj)
                                            innerFile[j].formattedSubLikeKey = ('isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.GraphicName) || ('isMainFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isMainFolder && innerFile[j].mandatoryCheck.mainName) ? true : false
                                            innerFile[j].ext = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.ext ? innerFile[j].mandatoryCheck.isGraphicFolder.ext : ''
                                        }
                                        else if (innerFile[j].name.includes('*') && ('isPattern' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isPattern)) {
                                            // let regExp = '[a-zA-Z0-9]+';
                                            let regExp = '[a-zA-Z0-9\\-\\_]+'
                                            let name = innerFile[j].name;
                                            if (name.includes('FileTypeName')) {
                                                var FileTypeName = filteredFileNameAray[0].filename
                                                fileTypeObj['FileTypeName'] = FileTypeName
                                                name = getFormattedName(name, fileTypeObj)
                                            }

                                            let splittedName = name.split('*')
                                            if (name.includes('*')) {
                                                var formattedFileName = name.replace('*', regExp);
                                                formattedFileName = formattedFileName.replace("/", "\\\\")
                                                var regex = new RegExp(formattedFileName, "g")
                                                var lwfpath = this.clientUtility.pathDetails.client.path;
                                                if (isPathExist(lwfpath)) {
                                                    var compath = await GetAllFiles(lwfpath)
                                                    for (var h = 0; h < compath.length; h++) {
                                                        var patternedName = regex.test(compath[h])
                                                        if (compath[h].includes(splittedName[0]) && patternedName) {
                                                            innerFile[j].formattedName = basename(compath[h]);
                                                            innerFile[j].formattedSubLikeKey = false
                                                            innerFile[j].ext = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.ext ? innerFile[j].mandatoryCheck.isGraphicFolder.ext : ''
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        else if ('isMainFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isMainFolder && innerFile[j].mandatoryCheck.mainName) {
                                            innerFile[j].formattedName = innerFile[j].mandatoryCheck.mainName
                                            innerFile[j].formattedSubLikeKey = true
                                            innerFile[j].ext = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.ext ? innerFile[j].mandatoryCheck.isGraphicFolder.ext : ''

                                        }
                                        else if ('isSubFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isSubFolder && innerFile[j].mandatoryCheck.mainName) {
                                            innerFile[j].formattedName = innerFile[j].mandatoryCheck.mainName
                                            innerFile[j].formattedSubLikeKey = true
                                            innerFile[j].ext = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.ext ? innerFile[j].mandatoryCheck.isGraphicFolder.ext : ''


                                        }
                                        else {
                                            var FileTypeName = getFormattedName(innerFile[j].name, this.clientUtility.activityDetails.placeHolders)
                                            innerFile[j].formattedName = FileTypeName
                                            innerFile[j].formattedSubLikeKey = false
                                            innerFile[j].ext = 'isGraphicFolder' in innerFile[j].mandatoryCheck && Object.keys(innerFile[j].mandatoryCheck.isGraphicFolder).length > 0 && innerFile[j].mandatoryCheck.isGraphicFolder.ext ? innerFile[j].mandatoryCheck.isGraphicFolder.ext : ''


                                        }
                                    }
                                    let fileName = innerFile[j] && innerFile[j].formattedName ? innerFile[j].formattedName.replace(extname(innerFile[j].formattedName), "") : ""
                                    let filteredBasePath2 = filesInfo.filter((list) => list.name == fileName);
                                    console.log(filteredBasePath2, "filteredBasePath2")
                                    innerFile[j].okmFilePath = filteredBasePath2.length > 0 ? filteredBasePath2[0].basePath : filteredBasePathArray.length > 0 && filteredBasePathArray[0].basePath ? filteredBasePathArray[0].basePath : ''
                                    var lwfpath = this.clientUtility.pathDetails.client.path;
                                    // var folderName = innerFile[j].formattedName.split('/');
                                    // const currentPath = extendedJoin([lwfpath, folderName[0]]);
                                    // var folderName =  innerFile[j].formattedName && innerFile[j].formattedName.includes('/')  ?innerFile[j].formattedName.split('/') : innerFile[j].formattedName
                                    // const currentPath =  innerFile[j].formattedName && innerFile[j].formattedName.includes('/')  ? extendedJoin([lwfpath, folderName[0]]) : extendedJoin([lwfpath, folderName]);
                                    // const currentPath = extendedJoin([lwfpath, folderName[0]]);
                                    var folderName = innerFile[j].formattedName && innerFile[j].formattedName.includes('/') ? innerFile[j].formattedName.split('/') : innerFile[j].formattedName
                                    // let currentPath = "";
                                    // if (folderName) {
                                    const currentPath = folderName ? innerFile[j].formattedName && innerFile[j].formattedName.includes('/') ? extendedJoin([lwfpath, folderName[0]]) : extendedJoin([lwfpath, folderName]) : extendedJoin([lwfpath, ""]);
                                    // }else {
                                    //     currentPath = extendedJoin([lwfpath, ""]);
                                    // }
                                    // to be confirmed and  deleted
                                    // if (isPathExist(currentPath) && folderName) {
                                    //     const fstat = await stat(currentPath);
                                    //     if (fstat.isDirectory() && !(('isMainFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isMainFolder && innerFile[j].mandatoryCheck.mainName) && !('isSubFolder' in innerFile[j].mandatoryCheck && innerFile[j].mandatoryCheck.isSubFolder && innerFile[j].mandatoryCheck.mainName))) {
                                    //         var compath = await GetAllFiles(currentPath)
                                    //         for (var p = 0; p < compath.length; p++) {
                                    //             var baseName = basename(compath[p])
                                    //             var baseName3 = baseName.split('.')
                                    //             if (filteredFileNameAray.length > 0 && baseName3[0] == filteredFileNameAray[0].filename) {
                                    //                 var folderFilePath = extendedJoin([folderName[0], baseName]);
                                    //                 innerFile[j].formattedName = folderName[0] + '/' + baseName
                                    //                 var filePath = innerFile[j].formattedName && folderFilePath ? extendedJoin([this.clientUtility.pathDetails.client.path, folderFilePath]) : "";
                                    //             } else if (filteredFileNameAray.length == 0) {
                                    //                 var folderFilePath = extendedJoin([folderName[0], baseName]);
                                    //                 innerFile[j].formattedName = folderName[0] + '/' + baseName
                                    //                 var filePath = innerFile[j].formattedName && folderFilePath ? extendedJoin([this.clientUtility.pathDetails.client.path, folderFilePath]) : "";
                                    //             }
                                    //             if (isPathExist(filePath)) {
                                    //                 if (innerFile[j].mandatoryCheck.isInputFile) {
                                    //                     //const path = (innerFile[j] && innerFile[j].okmFilePath ? extendedJoin([innerFile[j].okmFilePath ], false) : '') + innerFile[j].formattedName;
                                    //                     const path = innerFile[j] && innerFile[j].okmFilePath ? innerFile[j].okmFilePath + innerFile[j].formattedName : ''
                                    //                     switch (this.clientUtility.activityDetails.dmsType) {
                                    //                         case "azure":
                                    //                             innerFile[j].uuid = "azure";
                                    //                             break;
                                    //                         case "local":
                                    //                             innerFile[j].uuid = "local";
                                    //                             break;
                                    //                         default:
                                    //                             innerFile[j].uuid = await okmHelper.getUuid(path);
                                    //                             break;
                                    //                     }
                                    //                     innerFile[j].Resotorepath = path;
                                    //                     // to be removed
                                    //                     // await this.getRestoreVersion(innerFile[j], this.clientUtility.activityDetails.dmsType)
                                    //                 }

                                    //                 // to be confirmed below line
                                    //                 if (!innerFile[j].mandatoryCheck.isInputFile && !('previousActivityId' in innerFile[j].mandatoryCheck)) {
                                    //                     innerArray.push(innerFile[j])
                                    //                 }
                                    //                 if ('previousActivityId' in innerFile[j].mandatoryCheck && !previousData) {
                                    //                     innerArray.push(innerFile[j])
                                    //                 }
                                    //             }
                                    //         }
                                    //     }
                                    // }
                                    // var filePath = innerFile[j].formattedName ? extendedJoin([this.clientUtility.pathDetails.client.path, innerFile[j].formattedName]) : "";
                                    // if (isPathExist(filePath)) {
                                    //     if (innerFile[j].mandatoryCheck.isInputFile) {
                                    //         const path = (innerFile[j] && innerFile[j].okmFilePath ? extendedJoin([innerFile[j].okmFilePath], false) : '') + innerFile[j].formattedName;
                                    //         switch (this.clientUtility.activityDetails.dmsType) {
                                    //             case "azure":
                                    //                 innerFile[j].uuid = "azure";
                                    //                 break;
                                    //             case "local":
                                    //                 innerFile[j].uuid = "local";
                                    //                 break;
                                    //             default:
                                    //                 innerFile[j].uuid = await okmHelper.getUuid(path);
                                    //                 break;
                                    //         }
                                    //         innerFile[j].Resotorepath = path;
                                    //         // to be removed
                                    //         // await this.getRestoreVersion(innerFile[j], this.clientUtility.activityDetails.dmsType)
                                    //     }


                                    //     // to be confirmed below line
                                    //     if (!innerFile[j].mandatoryCheck.isInputFile && !('previousActivityId' in innerFile[j].mandatoryCheck)) {
                                    //         innerArray.push(innerFile[j])
                                    //     }
                                    //     if ('previousActivityId' in innerFile[j].mandatoryCheck && !previousData) {
                                    //         innerArray.push(innerFile[j])
                                    //     }
                                    // }
                                }
                            }

                        }
                        var originalArray = [...new Set(innerArray)];

                        // to be confirmed and deleted 
                        // let filteredFiles = []
                        // for (var n = 0; n < originalArray.length; n++) {
                        //     let ele2 = originalArray[n]
                        //     filteredFiles = filesInfo.filter((sublist) => ((sublist.files && sublist.files.length > 0) && (sublist.typeId == keysLength[i]) && (extname(ele2.formattedName) == sublist.files[0].ext)));
                        // }
                        if (innerArray && innerArray.length > 0 && originalArray && originalArray.length > 0) {
                            let newOriginalArray = []
                            // to be confirmed and deleted 
                            // for (let k = 0; k < filteredFiles.length; k++) {
                            //     let ele = filteredFiles[k];
                            //     if (newOriginalArray.filter((sublist) => basename(sublist.formattedName) == ele.name).length == 0) {
                            //         newOriginalArray.push({ "ext": originalArray[0].ext, "formattedName": ele.files[0].name, "formattedSubLikeKey": originalArray[0].formattedSubLikeKey, "mandatoryCheck": originalArray[0].mandatoryCheck, "name": originalArray[0].name, "okmFilePath": ele.basePath })
                            //     }
                            // }
                            originalArray = [...originalArray, ...newOriginalArray]
                            originalArray = [...new Set(originalArray)];

                            clearSaveFiles[keysLength[i]] = originalArray
                            clearSaveFiles[keyFile] = originalArray
                            newInnerArray.push(originalArray);


                            if (keyFile == keysLength[i - 1]) {
                                clearSaveFiles[keyFile] = newInnerArray
                            } else {
                                clearSaveFiles[keyFile] = originalArray

                            }
                        }

                        //innerArray = []

                    }

                }
                console.log(clearSaveFiles, "clearSaveFiles")
                resolve(clearSaveFiles)
            } catch (e) {
                global.log(e, 'error in fetching file details')
                reject(e)
            }
        })
    }

    async getToolsOutputDetails(incomingDetails, filesInfo) {
        return new Promise(async (resolve, reject) => {
            try {
                var toolsOutputArray = []
                if (this.clientUtility.activityDetails.toolsConfig && Object.keys(this.clientUtility.activityDetails.toolsConfig).length && this.clientUtility.activityDetails.toolsConfig.tools) {
                    var keysLength2 = Object.keys(this.clientUtility.activityDetails.toolsConfig.tools)
                    for (var i = 0; i < keysLength2.length > 0; i++) {
                        let file = this.clientUtility.activityDetails.toolsConfig.tools[keysLength2[i]];
                        if (file && Object.keys(file).length > 0 && file.files && Object.keys(file.files).length > 0) {
                            file.files.output = file.files.filter(x => x.fileFlowType.includes("OUT"))
                            var innerFile = file.files.output
                            var innerArray = []
                            var keysLength3 = Object.keys(innerFile)
                            for (var j = 0; j < keysLength3.length > 0; j++) {
                                var outputFile = innerFile[keysLength3[j]];
                                if (Array.isArray(outputFile.typeId)) {
                                    for (var h = 0; h < outputFile.typeId.length; h++) {
                                        var keysLength4 = outputFile.typeId[h]
                                        var filteredFileNameAray = incomingDetails.filter((list) => list.filetypeid == outputFile.typeId[h]);
                                        var filteredBasePathArray = filesInfo.filter((list) => list.typeId == outputFile.typeId[h])
                                        if (filteredFileNameAray.length > 0) {
                                            var fileTypeObj = {}
                                            if (outputFile.name.includes('PageRange')) {
                                                var FileTypeName = filteredFileNameAray[0].newfilename
                                                fileTypeObj['PageRange'] = FileTypeName
                                                outputFile.formattedName = getFormattedName(outputFile.name, fileTypeObj)
                                                outputFile.formattedSubLikeKey = false
                                                outputFile.ext = ''


                                            } else if (outputFile.name.includes('FileTypeName')) {
                                                var FileTypeName = filteredFileNameAray[0].filename
                                                fileTypeObj['FileTypeName'] = FileTypeName
                                                outputFile.formattedName = getFormattedName(outputFile.name, fileTypeObj)
                                                outputFile.formattedSubLikeKey = false
                                                outputFile.ext = ''


                                            }
                                            else {
                                                var FileTypeName = getFormattedName(outputFile.name, this.clientUtility.activityDetails.placeHolders)
                                                outputFile.formattedName = FileTypeName
                                                outputFile.formattedSubLikeKey = false
                                                outputFile.ext = ''


                                            }

                                        }
                                        let fileName = outputFile && outputFile.formattedName ? outputFile.formattedName.replace(extname(outputFile.formattedName), "") : ""
                                        let filteredBasePath2 = filesInfo.filter((list) => list.name == fileName);
                                        console.log(filteredBasePath2, "filteredBasePath2")
                                        outputFile.okmFilePath = filteredBasePath2.length > 0 ? filteredBasePath2 : filteredBasePathArray.length > 0 && filteredBasePathArray[0].basePath ? filteredBasePathArray[0].basePath : ''
                                        var filePath = extendedJoin([this.clientUtility.pathDetails.client.path, outputFile.formattedName]);
                                        if (isPathExist(filePath)) {
                                            var abc = Object.assign({}, outputFile);
                                            if ('cancelFile' in outputFile) {
                                                if (!outputFile.cancelFile) {
                                                    innerArray.push(abc)
                                                }
                                            } else {
                                                innerArray.push(abc)
                                            }
                                        }
                                    }
                                    if (innerArray && innerArray.length > 0) {
                                        toolsOutputArray[outputFile.typeId] = innerArray

                                    }
                                    innerArray = []

                                } else if (outputFile.typeId && Object.keys(outputFile.typeId).length > 0) {
                                    var filteredFileNameAray = incomingDetails.filter((list) => list.filetypeid == outputFile.typeId);
                                    var filteredBasePathArray = filesInfo.filter((list) => list.typeId == outputFile.typeId)
                                    if (filteredFileNameAray.length > 0) {
                                        var fileTypeObj = {}
                                        if (outputFile.name.includes('PageRange')) {
                                            var FileTypeName = filteredFileNameAray[0].newfilename
                                            fileTypeObj['PageRange'] = FileTypeName
                                            outputFile.formattedName = getFormattedName(outputFile.name, fileTypeObj)
                                            outputFile.formattedSubLikeKey = false
                                            outputFile.ext = ''

                                        } else if (outputFile.name.includes('FileTypeName')) {
                                            var FileTypeName = filteredFileNameAray[0].filename
                                            fileTypeObj['FileTypeName'] = FileTypeName
                                            outputFile.formattedName = getFormattedName(outputFile.name, fileTypeObj)
                                            outputFile.formattedSubLikeKey = false
                                            outputFile.ext = ''


                                        }
                                        else {
                                            var FileTypeName = getFormattedName(outputFile.name, this.clientUtility.activityDetails.placeHolders)
                                            outputFile.formattedName = FileTypeName
                                            outputFile.formattedSubLikeKey = false
                                            outputFile.ext = ''

                                        }
                                    }
                                    let fileName = outputFile && outputFile.formattedName ? outputFile.formattedName.replace(extname(outputFile.formattedName), "") : ""
                                    let filteredBasePath2 = filesInfo.filter((list) => list.name == fileName);
                                    console.log(filteredBasePath2, "filteredBasePath2")
                                    outputFile.okmFilePath = filteredBasePath2.length > 0 ? filteredBasePath2[0].basePath : filteredBasePathArray.length > 0 && filteredBasePathArray[0].basePath ? filteredBasePathArray[0].basePath : ''
                                    var filePath = extendedJoin([this.clientUtility.pathDetails.client.path, outputFile.formattedName]);
                                    if (isPathExist(filePath)) {
                                        if ('cancelFile' in outputFile) {
                                            if (!outputFile.cancelFile) {
                                                innerArray.push(abc)
                                            }
                                        } else {
                                            innerArray.push(abc)
                                        }
                                    }
                                }
                            }
                        }
                        if (innerArray && innerArray.length > 0) {
                            toolsOutputArray[outputFile.typeId] = innerArray
                        }
                        innerArray = []
                    }
                    console.log(toolsOutputArray, "toolsOutputArray")
                    await this.removeSyncedFiles(toolsOutputArray, this.clientUtility)
                    resolve(toolsOutputArray)
                }
                resolve()
            }
            catch (e) {
                global.log(e, 'error in fetching file details')
                reject(e)
            }
        })

    }

    async removeSyncedFiles(removeFileDetails, clientUtility) {
        return new Promise(async (resolve, reject) => {
            try {
                var keysDeleteLength = Object.keys(removeFileDetails)
                for (var i = 0; i < keysDeleteLength.length > 0; i++) {
                    let file = removeFileDetails[keysDeleteLength[i]];
                    if (file && file.length > 0) {
                        for (var j = 0; j < file.length > 0; j++) {
                            var filePath = '';
                            filePath = file[j].okmFilePath + file[j].formattedName
                            filePath = getFormattedName(filePath, clientUtility.activityDetails.placeHolders)

                            await this.deleteTranscationEnteris(clientUtility, filePath, file[j].formattedSubLikeKey, file[j].ext)
                            if (!file[j].formattedSubLikeKey) {
                                switch (clientUtility.activityDetails.dmsType) {
                                    case "azure":
                                        await azureHelper.deleteFile(filePath);
                                        break;
                                    case "local":
                                        await localHelper.deletelocalFile(filePath);
                                        break;
                                    default:
                                        await deleteFile(filePath);
                                        break;
                                }
                            }
                        }

                    }
                }
                resolve()
            }
            catch (e) {
                console.log(e, "removed synced fles")
                reject(e)
            }
        })
    }


}
module.exports = {
    ClearActivity
};
