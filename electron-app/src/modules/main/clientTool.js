const { extendedJoin, getFormattedParams, getParamsPair, getParamsValue, retreiveLocalFiles, readDir, getFormattedName, isPathExist, readSmallFile, uploadS3Payload } = require('../utils/io');
const { execute, executeOutputFileValidation } = require('../utils/process');
const { copyIOFiles, copyIOFilesWithImpersonator, fetchFileCopyDetails, copyDependanceFiles } = require('./copyFiles');
const softwareHelper = require('./../utils/software');
const { post } = require('../http/index');
const { APIConfig } = require('../../config/api');
const { getRetreiveBlobFilesURL } = require("../utils/azure.js");
const { config } = require('../../config/index');
const { promises } = require('fs');
const { onServiceTools } = require('../../modules/main/serviceTool');
const { GetAllFiles } = require('../main/postProcessing/onSaveValidation')
const micromatch = require('micromatch');
const { basename, dirname, extname, join } = require('path');
const { SyncToolsFile } = require('../../../src/modules/main/syncToolsFile')
const okmHelper = require('../utils/okm');
const { preProcessing } = require('./preprocessing');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { getChecksum } = require('../utils/index');
const actions = { save: 'save', reject: 'reject', pending: 'pending', isCompulsoryCheck: 'isCompulsoryCheck' };
const { AutoOpenFile } = require('../main/autoOpenFile');
const os = require('os');
const path = require("path")
const fs = require("fs");



// const { SyncToolsFile } = require('../main/syncToolsFile');

class ClientTool {
    fileStatus = {
        new: [],
        update: [],
        noChange: [],
        inValid: [],
        missedFile: [],
        missedFileType: []
    };
    fileTypes = [];
    userId = null;
    wf = null;
    tool = {
        wf: null,
        apiId: null,
        toolName: null,
        config: {},
        id: null,
        fileConfig: { input: [], output: [] },
        params: [],
        path: '',
        runAsSoftware: false,
        dependentFiles: [],
        toolTypeId: null,
        toolOutputId: null
    };
    filesInfo = {
        data: []
    };

    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }

    startProcess(payload) {
        let toolOutput = {
            isSuccess: false,
            msg: ''
        };
        return new Promise(async (resolve, reject) => {
            try {
                await this.clientUtility.updateStatusToServer({ message: 'Fetching File Details', progress: 30 }, 2);
                await this.fetchDetails(payload);
                await this.clientUtility.updateStatusToServer({ message: 'Fetched File Details', progress: 35 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Preparing API', progress: 35 }, 2);
                await this.createAPI();
                await this.clientUtility.updateStatusToServer({ message: 'Copying Dependent Files', progress: 40 }, 2);
               await this.copyToolsDependentFiles();
                await this.clientUtility.updateStatusToServer({ message: 'Prepared API', progress: 40 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Copied Dependent Files', progress: 50 }, 2);
                await this.getSoftwarePath();
                await this.getSoftwarePaths();
                await this.clientUtility.updateStatusToServer({ message: 'Processing Input Files', progress: 50 }, 2);
                await this.processInputFiles();
                await this.clientUtility.updateStatusToServer({ message: 'Processed Input Files', progress: 60 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Updating API', progress: 60 }, 2);
                await this.updateAPI();
                await this.clientUtility.updateStatusToServer({ message: 'Updated API', progress: 65 }, 2);
                if (this.tool.runAsSoftware) {
                    await this.clientUtility.updateStatusToServer({ message: `Opening Software ${this.tool.toolName ? `(${this.tool.toolName})` : ''}`, progress: 65 }, 2);
                    this.executeTool(payload);
                    toolOutput = {
                        isSuccess: true,
                        msg: 'Software Opened Successfully'
                    }
                    await this.clientUtility.updateStatusToServer({ message: `Opened Software ${this.tool.toolName ? `(${this.tool.toolName})` : ''}`, progress: 85 }, 2);
                } else {
                    await this.clientUtility.updateStatusToServer({ message: `Executing Tool ${this.tool.toolName ? `(${this.tool.toolName})` : ''}`, progress: 65 }, 2);
                    // Busy Directory not required during the tool execution
                    // await this.checkBusyFiles(this.clientUtility.pathDetails.client.path);
                    toolOutput = await this.executeTool(payload);
                    await this.clientUtility.updateStatusToServer({ message: `Executing Tool ${this.tool.toolName ? `(${this.tool.toolName})` : ''}`, progress: 75 }, 2);
                    await this.clientUtility.updateStatusToServer({ message: 'Processing Output Files', progress: 75 }, 2);
                    await this.processOutputFiles();
                    await this.clientUtility.updateStatusToServer({ message: 'Processed Output Files', progress: 85 }, 2);
                }
                if (!toolOutput.isSuccess) throw toolOutput.msg;
                await this.clientUtility.updateStatusToServer({ message: 'Completing API', progress: 85 }, 2);
                await this.completeAPI(toolOutput);
                await this.autoOpenFiles();
                //need to handle here payloadupload s3
                if(this.tool.fileConfig["input"].filter((list) => list.isS3Upload).length > 0){                   
                    await uploadS3Payload(this.clientUtility, this.tool.fileConfig["input"])
                }
                await this.clientUtility.updateStatusToServer({ message: 'Completed API', progress: 90 }, 2);
                resolve();
            } catch (err) {
                if (this.tool.apiId) await this.completeAPI({ isSuccess: false, msg: err.message ? err.message : err });
                global.log(err, 'Sync');
                reject(err);
            }
        });
    }
    preProcessing(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await preProcessing(this.filesInfo, this.clientUtility, this.action, 'synctool');
                await this.fetchDetails(payload);
                resolve();
            } catch (err) {
                reject(err)
            }
        });
    }
    async fetchFileStatus() {
        const inputConfig = this.tool.fileConfig.output ? this.tool.fileConfig.output : {};
        const inputKeys = Object.keys(inputConfig);
        for (let i = 0; i < inputKeys.length; i++) {
            const inputKey = inputKeys[i];
            const inputFile = inputConfig[inputKey];
            inputFile.typeId = inputFile.fileTypes
            const inputFileTypeId = inputFile.typeId instanceof Array ? inputFile.typeId : [inputFile.typeId];
            const fTypeName = inputFile.fileTypeName;
            // if (inputFile.isSync == false) continue;
            const skipFileConfig = inputFile.skipFileConfig == true;
            const lwfDetails = inputFile.lwf && inputFile.lwf.src ? {
                src: inputFile.lwf.src, isRoot: !!inputFile.lwf.isRoot
            } : { src: '', isRoot: false };
            let FileTypeName = fTypeName ? fTypeName : ''
            // let piivalue = await this.getFileNameForPii({ workOrderId: this.clientUtility.activityDetails.workOrderId, fileName :FileTypeName  })
            // piivalue = piivalue != '' ? piivalue : ''
            let articletype = ((this.clientUtility.activityDetails.placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == FileTypeName).pop() || {}).articletype;
            const piivalue = (
                (this.clientUtility.activityDetails.placeHolders.ArticleTypeList || [])
                    .filter(x => x.FileTypeName == FileTypeName)
                    .pop() || {}
            ).piinumber;
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, articletype: articletype, IssuePII: piivalue }

            const formattedFTypeName = fTypeName ? getFormattedName(fTypeName, this.clientUtility.activityDetails.placeHolders) : '';
            const formattedFTypeNameRegex = new RegExp(formattedFTypeName);
            const filteredfileDetails = this.filesInfo.data.filter(fd => {
                const formattedFTypeNameResult = fd.name.match(formattedFTypeNameRegex);
                const isTypeNameMatched = (fTypeName ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                return inputFileTypeId.includes(parseInt(fd.typeId)) && isTypeNameMatched &&
                    ((this.clientUtility.activityDetails.fileType.fileId && fd.allowSubFileType) ? fd.incomingFileId == this.clientUtility.activityDetails.fileType.fileId : true)
            });
            for (let j = 0; j < filteredfileDetails.length; j++) {
                const { name: fileTypeName, typeId, incomingFileId, key, basePath, files, pageRange } = filteredfileDetails[j];

                const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                const excludedFiles = [];
                this.filesInfo.data.forEach((data) => {
                    if (fileTypeName != data.name) excludedFiles.push(extendedJoin([this.clientUtility.pathDetails.client.path, data.name, '**', '*']));
                });
                let JnlTypeFileTypeName = fileTypeName + this.clientUtility.activityDetails.placeHolders.JnlTypeFileName
                let ChapterNumber = fileTypeName.includes('_Chapter') ? fileTypeName.replace('_Chapter', "") : ""

                const formattedName = getFormattedName(lwfDetails.src ? lwfDetails.src : inputFile.name, { ...this.clientUtility.activityDetails.placeHolders, FileTypeName: fileTypeName, PageRange: pageRange, JnlTypeFileTypeName, ChapterNumber });
                // let filePath = extendedJoin([(lwfDetails.src && lwfDetails.isRoot) ? folderStructureWithRoot : folderStructure, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                // lwf changes for cup
                //let filePath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ? extendedJoin([ folderStructureWithRoot, formattedName]).replace(new RegExp(/\\/, 'g'), '/') :  extendedJoin([(lwfDetails.src && lwfDetails.isRoot) ? folderStructureWithRoot : folderStructure, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                let filePath = extendedJoin([folderStructureWithRoot, formattedName]).replace(new RegExp(/\\/, 'g'), '/');
                filePath = filePath[filePath.length - 1] == '/' ? (filePath + '*') : filePath;
                const retreivedFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), excludedFiles);
                const srcFiles = micromatch(retreivedFiles, filePath).map(file => extendedJoin([file]));
                for (let k = 0; k < srcFiles.length; k++) {
                    const srcFile = extendedJoin([srcFiles[k]]);
                    // const isRootFile = !srcFile.includes(folderStructure);
                    // lwf changes for cup
                    //const isRootFile =  Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ? !srcFile.includes(folderStructureWithRoot) : !srcFile.includes(folderStructure);
                    const isRootFile = !srcFile.includes(folderStructureWithRoot);
                    const srcFileName = basename(srcFile);
                    const dirName = extendedJoin([dirname(srcFile), '/']);
                    // const intermediatePath = dirName.replace(isRootFile ? folderStructureWithRoot : folderStructure, '');
                    // lwf changes for cup
                    // const intermediatePath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ?dirName.replace(isRootFile ? folderStructureWithRoot : folderStructureWithRoot, '')  : dirName.replace(isRootFile ? folderStructureWithRoot : folderStructure, '');
                    const intermediatePath = dirName.replace(isRootFile ? folderStructureWithRoot : folderStructureWithRoot, '');
                    const path = (intermediatePath ? extendedJoin([intermediatePath], false) : '') + srcFileName;
                    const relativeSrc = extendedJoin([srcFile], false).replace(this.clientUtility.pathDetails.client.path, '');
                    let fileValidationStatus = {};
                    if (skipFileConfig) {
                        fileValidationStatus = await new SyncToolsFile(this).getToolsFileDetail(inputFile, basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                    } else {
                        this.clientUtility = this.clientUtility.activityDetails ? this.clientUtility : this.clientUtility.clientUtility
                        fileValidationStatus = await this.isValidFile(basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                    }
                    const dest = dirname(fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) == '.' ? '' : dirname(fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) + '/';
                    const fileDetail = {
                        inputKey, src: srcFile, relativeSrc, srcName: fileValidationStatus.lwfDetails.src ? basename(fileValidationStatus.lwfDetails.name) : srcFileName,
                        dest: basePath + dest, typeId, fileId: incomingFileId
                    };
                    // if (fileValidationStatus.isValid) {
                    //     if (fileValidationStatus.isAlreadyExist) {
                    //         if (fileValidationStatus.existedFileInfo.uuid) {
                    //             const existedFile = files.find((file) => file.path == fileValidationStatus.existedFileInfo.name);
                    //             let srcChecksum = undefined;
                    //             let okmChecksum = undefined;
                    //             let awt = [];
                    //             awt.push(getChecksum(srcFile).then(val => { srcChecksum = val; }).catch(err => { }));
                    //             switch (this.clientUtility.activityDetails.dmsType) {
                    //                 case "azure":
                    //                     awt.push(azureHelper.getChecksum(existedFile.path).then(val => { okmChecksum = val; }).catch(err => { }));
                    //                     break;                            
                    //                 default:
                    //                     awt.push(okmHelper.getChecksum(existedFile.uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                    //                     break;
                    //             }
                    //             await Promise.all(awt);
                    //             if (srcChecksum == okmChecksum) {
                    //                 this.fileStatus.noChange.push({ ...fileDetail, destUUID: existedFile.uuid, actFileMapId: existedFile.actfilemapid });
                    //             } else {
                    //                 this.fileStatus.update.push({ ...fileDetail, destUUID: existedFile.uuid, actFileMapId: existedFile.actfilemapid });
                    //             }
                    //         } else {
                    //             continue;
                    //         }
                    //     } else {
                    this.fileStatus.new.push(fileDetail);
                    //     }
                    // } else {
                    //     this.fileStatus.inValid.push(fileDetail);
                    // }
                }
                if (srcFiles.length == 0 && !skipFileConfig) this.fileStatus.missedFile.push({ inputKey, srcName: formattedName, typeId, fileId: incomingFileId })
            }
            if (filteredfileDetails.length == 0 && !skipFileConfig) this.fileStatus.missedFileType.push({ inputKey, srcName: getFormattedName(inputFile.name, this.clientUtility.activityDetails.placeHolders), typeId: inputFileTypeId });
        }
    }



    async uploadFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                let files = [...this.fileStatus.new, ...this.fileStatus.update, ...this.fileStatus.noChange]
                const progressDetails = {
                    currentProgress: 50,
                    fileProgress: 40 / files,
                    completedFileCount: 0,
                    totalFileCount: files.length
                }
                this.tool.id = this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId ? this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId : this.tool.id
                await this.clientUtility.updateStatusToServer({ message: 'Uploading Files', progress: 50 }, 2);
                //let pathToDelete = [...new Set(files.map(ele => ele.dest))];
                //for (let index = 0; index < pathToDelete.length; index++) {
                const pth = this.filesInfo.data[0].basePath + `tool/${this.tool.id}/In/`
                let allFiles = [];
                let awat = [];
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        allFiles = await getRetreiveBlobFilesURL(pth)
                        for (let i = 0; i < allFiles.length; i++) {
                            let filePath = allFiles[i].path
                            awat.push(azureHelper.deleteFile(filePath));
                        }
                        break;
                    case "local":
                        allFiles = await localHelper.getRetreivelocalFilesURL(pth)
                        for (let i = 0; i < allFiles.length; i++) {
                            let filePath = allFiles[i].path
                            awat.push(localHelper.deletelocalFile(filePath));
                        }
                        break;
                    default:
                        break;
                }

                await Promise.all(awat);
                //}
                if (files.length) {
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        file.dest = this.filesInfo.data[0].basePath + `tool/${this.tool.id}/In/` + file.dest.replace(this.filesInfo.data[0].basePath, '');
                        await this.updateUploadProgressDetails(file, progressDetails, true);
                        await this.uploadNewFile(file);
                        await this.updateUploadProgressDetails(file, progressDetails, false);
                    }
                }
                else {
                    await this.clientUtility.updateStatusToServer({ message: `Uploading Completed`, progress: progressDetails.currentProgress }, 2);
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async updateUploadProgressDetails(file, progressDetails, isUploading) {
        if (isUploading) {
            await this.clientUtility.updateStatusToServer({ message: `Uploading Files (${file.srcName}) (${progressDetails.completedFileCount + 1}/${progressDetails.totalFileCount})`, progress: progressDetails.currentProgress }, 2);
        } else {
            progressDetails.currentProgress = progressDetails.fileProgress + progressDetails.currentProgress;
            ++progressDetails.completedFileCount;
            await this.clientUtility.updateStatusToServer({ message: `Uploaded Files (${file.srcName}) (${progressDetails.completedFileCount}/${progressDetails.totalFileCount})`, progress: progressDetails.currentProgress }, 2);
        }
    }

    async updateNoChangeFile(file) {
        const { actFileMapId } = file;
        await this.updateExistingFileDetails(actFileMapId);
    }

    async autoOpenFiles() {
        return new Promise((resolve, reject) => {
            try {
                if (this.clientUtility && this.clientUtility.activityDetails && Object.keys(this.clientUtility.activityDetails).length > 0 && this.clientUtility.activityDetails.config &&
                    Object.keys(this.clientUtility.activityDetails.config).length > 0 && this.clientUtility.activityDetails.config.invokeNextServiceTool && Object.keys(this.clientUtility.activityDetails.config.invokeNextServiceTool).length > 0 &&
                    this.clientUtility.activityDetails.config.invokeNextServiceTool.DesktopToolId == this.tool.id && this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId && this.clientUtility.activityDetails.config.invokeNextServiceTool.fileCheck) {
                    function TootStatus(_this, callback) {
                        const myInterval = setInterval(async () => {
                            var result = await _this.getToolsStatusForServiceTask();
                            if (result.length > 0 && (result[0].status == 'Success' || result[0].status == 'Failure')) {
                                clearInterval(myInterval);
                                var autoOpenFilesArray = (_this.clientUtility.activityDetails.toolsConfig && _this.clientUtility.activityDetails.toolsConfig.tools && Object.keys(_this.clientUtility.activityDetails.toolsConfig.tools).length > 0 &&
                                    Object.keys(_this.clientUtility.activityDetails.toolsConfig.tools).includes(_this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId.toString()) && _this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId) ? _this.clientUtility.activityDetails.toolsConfig.tools[_this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId] : []
                                //var keys = autoOpenFilesArray.length >0 ? Object.keys(autoOpenFilesArray.files.output) : []
                                var keys = Object.keys(autoOpenFilesArray).length > 0 ? Object.keys(autoOpenFilesArray.files.output) : []
                                keys.map(async (list) => {
                                    if (autoOpenFilesArray && autoOpenFilesArray.files && autoOpenFilesArray.files.output && Object.keys(autoOpenFilesArray.files.output).length > 0 && autoOpenFilesArray.files.output[list].fileopen) {
                                        let ext = extname(autoOpenFilesArray.files.output[list].name)
                                        let payload = {
                                            "activityDetails": { "wfEventId": _this.clientUtility.activityDetails.wfEventId, "toolId": _this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId },
                                            "filesInfo": { "ext": ext }
                                        }
                                        await new AutoOpenFile(_this.clientUtility).startProcess(payload)
                                    }
                                })
                                resolve()
                            }
                        }, 7000);
                    }
                    TootStatus(this, (data) => resolve(data));
                } 
                if (this.clientUtility.activityDetails.iscamundaflow == false && Object.keys(this.clientUtility.activityDetails.config).length > 0 && this.clientUtility.activityDetails.config.invokeNextTool && Object.keys(this.clientUtility.activityDetails.config.invokeNextTool).length > 0 && this.clientUtility.activityDetails?.isInvokeTool === true) {
                    var autoOpenFilesArray = (this.clientUtility.activityDetails.toolsConfig && this.clientUtility.activityDetails.toolsConfig.tools && Object.keys(this.clientUtility.activityDetails.toolsConfig.tools).length > 0 &&
                        Object.keys(this.clientUtility.activityDetails.toolsConfig.tools).includes(this.clientUtility.activityDetails.config.invokeNextTool.toString()) && this.clientUtility.activityDetails.config.invokeNextTool) ? this.clientUtility.activityDetails.toolsConfig.tools[this.clientUtility.activityDetails.config.invokeNextTool] : []
                    //var keys = autoOpenFilesArray.length >0 ? Object.keys(autoOpenFilesArray.files.output) : []
                    var keys = Object.keys(autoOpenFilesArray).length > 0 ? autoOpenFilesArray.files.filter((a => a.fileFlowType.includes('OUT'))) : []
                    keys.map(async (list) => {
                        if (autoOpenFilesArray && autoOpenFilesArray.files && list.fileopen) {
                            let ext = extname(list.name)
                            let payload = {
                                "activityDetails": { "wfEventId": this.clientUtility.activityDetails.wfEventId, "toolId": this.clientUtility.activityDetails.config.invokeNextTool },
                                "filesInfo": { "ext": ext }
                            }
                            await new AutoOpenFile(this.clientUtility).startProcess(payload)
                        }
                    })
                    resolve()
                }
                else {
                    resolve();
                }
            } catch (e) {
                reject(e)
            }
        })
    }

    async uploadExistingFile(file) {
        const { src, srcName, destUUID, actFileMapId, dest } = file;
        const fileName = srcName ? srcName : basename(src);
        const okmDest = dest.replace(new RegExp(/\\/, 'g'), '/');
        switch (this.clientUtility.activityDetails.dmsType) {
            case "azure":
                await azureHelper.uploadExistingFile(src, `${okmDest}${fileName}`)
                break;
            case "local":
                if (os.platform() == "win32" && isInternalConnection) {
                    await localHelper.uploadlocalExistingFileWithImpersonator(src, `${okmDest}${fileName}`);
                } else {
                    await localHelper.uploadlocalExistingFile(src, `${okmDest}${fileName}`)
                }
                break;
            default:
                await okmHelper.uploadExistingFile(src, destUUID);
                break;
        }
        await this.updateExistingFileDetails(actFileMapId);
        await this.updateFileSyncStatus();
        global.log(`${src} updated`);
    }

    async uploadNewFile(file) {
        const { src, srcName, dest, fileId } = file;
        const okmDest = dest.replace(new RegExp(/\\/, 'g'), '/');
        switch (this.clientUtility.activityDetails.dmsType) {
            case "azure":
                await azureHelper.uploadNewFile(src, okmDest, srcName);
                break;
            case "local":
                if (os.platform() == "win32" && isInternalConnection) {
                    await localHelper.uploadlocalNewFileWithImpersonator(src, okmDest, srcName);
                } else {
                    await localHelper.uploadlocalNewFile(src, okmDest, srcName);
                }
                break;
            default:
                break;
        }

        // let out = {};
        // switch (this.clientUtility.activityDetails.dmsType) {
        //     case "azure":
        //         out = await azureHelper.uploadNewFile(src,okmDest,srcName);
        //         break;        
        //     default:
        //         await okmHelper.deleteFile(okmDest + fileName);
        //         out = await okmHelper.uploadNewFile(src, okmDest, srcName);
        //         break;
        // }
        // const { uuid, path } = out;
        // await this.updateNewFileDetails(uuid, path, fileId);
        // await this.updateFileSyncStatus();
        global.log(`${src} input_added`);
    }

    async updateNewFileDetails(uuid, path, fileId) {
        let fileTrnData = {
            type: 'insert_new_file',
            payload: {
                wfEventId: this.clientUtility.activityDetails.wfEventId, uuid, path, fileId
            }
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateFileTRNLog}`, fileTrnData, headers);
    }

    async updateExistingFileDetails(actFileMapId) {
        let fileTrnData = {
            type: 'update_existing_file',
            payload: {
                actFileMapId
            }
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateFileTRNLog}`, fileTrnData, headers);
    }

    async updateFileSyncStatus() {
        if (!this.isFileSynced) {
            const payload = {
                wfEventId: this.clientUtility.activityDetails.wfEventId,
                status: true
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.updateFileSyncStatus}`, payload, headers);
            this.isFileSynced = true;
        }
    }
    async checkBusyFiles(path) {
        return new Promise(async (resolve, reject) => {
            var currentPath;
            // const dirPaths = await readDir(path);
            // for (let i = 0; i < dirPaths.length; i++) {
            //     const currentPath = extendedJoin([path, dirPaths[i]]);
            //     if (currentPath.includes('lock')) {
            //         var pattern = /\.~lock\.([\.a-z0-9]+)#/ig
            //         var fileName = dirPaths[i].replace(pattern, '$1')
            //         reject(`Please close the file (${fileName}).`);
            //     }
            // }
            //if (!(this.clientUtility.activityDetails.customer.id == '6' && this.clientUtility.activityDetails.stage.id == '1') && (this.clientUtility.activityDetails.activity.id == '6' || this.clientUtility.activityDetails.activity.id == '27')) {
            try {

                const dirPaths = await readDir(path);
                const fs = require("fs");
                for (let i = 0; i < dirPaths.length; i++) {
                    currentPath = extendedJoin([path, dirPaths[i]]);
                    let isFolder = (fs.lstatSync(currentPath)).isDirectory();
                    if (currentPath.includes(dirPaths[i]) && !isFolder) {
                        const fileHandle = await promises.rename(currentPath, currentPath);
                    }
                }
            } catch (e) {
                if (e && e.code === 'EBUSY') {
                    const relativeSrc = extendedJoin([currentPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                    reject(`Please close the busy directory (${relativeSrc}).`);
                } else {
                    reject(e);
                }
            }
            resolve()
            // } else {
            //     resolve()
            // }

        })
    }
    async fetchDetails(payload) {
        await this.fetchPayloadDetails(payload);
        this.clientUtility.activityDetails.iscamundaflow? await this.fetchFileDetails(): '';
        await this.fetchToolDetail();
    }

    async fetchPayloadDetails(payload) {
        const { activityDetails } = payload;
        this.tool.id = activityDetails.toolId;
        this.userId = activityDetails.userId;
        let filteredOtherArticleId =[]
        if(this.clientUtility.activityDetails.isOtherArticle)  {
                let incomingDetails = await this.getIncomingFileTypeDetails(this.clientUtility);
                console.log(incomingDetails, 'incomingDetailsh');
                incomingDetails = incomingDetails.filter(
                  list => list.articletype == 'Other Article',
                );
                incomingDetails.map(list =>
                  filteredOtherArticleId.push(parseInt(list.filetypeid)),
                );
                filteredOtherArticleId = new Set(filteredOtherArticleId);
              
              const ioKeys = Object.keys(this.clientUtility.activityDetails.toolsConfig.tools);
              for (let j = 0; j < ioKeys.length; j++) {
                const files = this.clientUtility.activityDetails.toolsConfig  && this.clientUtility.activityDetails.toolsConfig.tools && this.clientUtility.activityDetails.toolsConfig.tools[ioKeys[j]] && Object.keys(this.clientUtility.activityDetails.toolsConfig.tools[ioKeys[j]]).includes('files') && this.clientUtility.activityDetails.toolsConfig.tools[ioKeys[j]].files ? this.clientUtility.activityDetails.toolsConfig.tools[ioKeys[j]].files : [];
                for (let k=0;k<files.length;k++){
                    let { fileTypes } = files[k];
                    if (fileTypes.includes(83)) {
                      fileTypes = [...fileTypes, ...filteredOtherArticleId];
                      files[k].fileTypes = fileTypes;
                    }
                }
               
              }
            }
                
        const config = this.clientUtility.activityDetails.toolsConfig;
        const toolConfig = (config['tools'] && config['tools'][this.tool.id]) ? config['tools'][this.tool.id] : {};
        this.tool.fileConfig.input = toolConfig.files ? toolConfig.files.filter(x => (x.fileFlowType || []).includes("IN")) : []
        this.tool.fileConfig.output = toolConfig.files ? toolConfig.files.filter(x => (x.fileFlowType || []).includes("OUT")) : []
        this.tool.config = toolConfig;
        this.tool.runAsSoftware = !!toolConfig.runAsSoftware;
        this.wf = extendedJoin([this.clientUtility.pathDetails.client.path], false);
        this.wfbasename = extendedJoin([this.clientUtility.pathDetails.client.id], false)
        let DOI = this.clientUtility.activityDetails.placeHolders.DOI ? this.clientUtility.activityDetails.placeHolders.DOI : ''
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]), __WFBase__: extendedJoin([this.wfbasename]), __DOI__: DOI ? DOI.replaceAll('/', '_') : '' };
        // this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]), __WFBase__: extendedJoin([this.wfbasename]) };
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __SYSUser__: os.userInfo().username };

    }

    async createAPI() {
        const payload = {
            toolsId: this.tool.id,
            wfeventId: this.clientUtility.activityDetails.wfEventId,
            isForegroundService: true,
            userId: this.userId,
            actualActivityCount: this.clientUtility.activityDetails.activity.actualactivitycount

        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        this.tool.apiId = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.createAPIRequestId}`, payload, headers);
        this.tool.wf = extendedJoin([this.clientUtility.pathDetails.client.tools, this.tool.apiId.toString()], false);
        if (this.clientUtility.activityDetails.customer.id == '6') {
            for (var a = 0; a <= this.tool.fileConfig.input.length; a++) {
                let inputFile = this.tool.fileConfig.input[a];
                if (Array.isArray(inputFile)) {
                    for (var b = 0; Object.keys(inputFile).length; b++) {
                        var file = inputFile && Object.keys(inputFile).length ? inputFile.src : {};
                        if (Array.isArray(file)) {
                            for (var c = 0; Object.keys(file).length; c++) {
                                if (file && file.name && Object.keys(file.name).length > 0) {
                                    if (file[c].name.includes(';FileTypeName;/') || file.name.includes('Articles/')) {
                                        let wf2 = file.name.includes(';FileTypeName;/') ? extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, this.filesInfo.data[0].name]) : extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, 'Articles'])
                                        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: wf2 }
                                    }
                                }
                            }
                        }
                        else {
                            if (file && file.name && Object.keys(file.name).length > 0) {
                                if (file.name.includes(';FileTypeName;/') || file.name.includes('Articles/')) {
                                    let wf2 = file.name.includes(';FileTypeName;/') ? extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, this.filesInfo.data[0].name]) : extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, 'Articles'])
                                    this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: wf2 }
                                }
                            }
                        }
                    }
                } else {
                    var file = inputFile && Object.keys(inputFile).length ? inputFile.src : {};
                    if (Array.isArray(file)) {
                        for (var c = 0; Object.keys(file).length; c++) {
                            if (file && file.name && Object.keys(file.name).length > 0) {
                                if (file[c].name.includes(';FileTypeName;/') || file.name.includes('Articles/')) {
                                    let wf2 = file.name.includes(';FileTypeName;/') ? extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, this.filesInfo.data[0].name]) : extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, 'Articles'])
                                    this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: wf2 }
                                }
                            }
                        }
                    }
                    else {
                        if (file && file.name && Object.keys(file.name).length > 0) {
                            if (file.name.includes(';FileTypeName;/') || file.name.includes('Articles/')) {
                                let wf2 = file.name.includes(';FileTypeName;/') ? extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, this.filesInfo.data[0].name]) : extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, 'Articles'])
                                this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: wf2 }
                            }
                        }
                    }
                }

            }
            for (var i = 0; i < this.tool.params.length; i++) {
                var file = this.tool.params[i]
                if (file.value.includes(';FileTypeName;')) {
                    if (this.filesInfo && this.filesInfo.data.length > 0 && this.filesInfo.data[0] && this.filesInfo.data[0].name) {
                        const placeHolders = { ...this.clientUtility.activityDetails.placeHolders, ...{ FileTypeName: this.filesInfo.data[0].name } }
                        var fileName = getFormattedName(file.value, placeHolders)
                        file.value = extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, fileName])

                    }
                }
            }
        }
        for (var i = 0; i < this.tool.params.length; i++) {
            var file = this.tool.params[i]
            if (file.value.includes(';FileTypeName;')) {
                if (this.filesInfo && this.filesInfo.data.length > 0 && this.filesInfo.data[0] && this.filesInfo.data[0].name) {
                    const placeHolders = { ...this.clientUtility.activityDetails.placeHolders, ...{ FileTypeName: this.filesInfo.data[0].name } }
                    var fileName = getFormattedName(file.value, placeHolders)
                    file.value = extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, fileName])

                }
            }
        }
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __TWF__: extendedJoin([this.tool.wf]) };
        this.tool.params = getFormattedParams(this.tool.params, this.clientUtility.activityDetails.placeHolders);

    }

    async updateAPI() {
        const payload = {
            apiId: this.tool.apiId,
            inputParams: { path: this.tool.path, params: this.tool.params }
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.updateAPIRequestId}`, payload, headers);
    }

    async completeAPI(output) {
        const payload = {
            apiId: this.tool.apiId,
            status: output.isSuccess ? 'Success' : 'Failure',
            remarks: output.msg.toString(),
            response: {},
            sId: this.clientUtility.sid,
            tooloutputid: this.tool.toolOutputId,
            isFileAvailable: false,
            actualActivityCount: this.clientUtility.activityDetails.activity.actualactivitycount
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.completeAPIRequestId}`, payload, headers);
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
            eventData: this.clientUtility.activityDetails.eventData,
            iscamundaflow:this.clientUtility.activityDetails.iscamundaflow
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, validationFileConfig, fileTypes } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.fileTypes = fileTypes;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
    }

    async fetchToolDetail() {
        const payload = {
            toolId: this.tool.id,
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { apiconfig, tooltypeid, tooloutputid, toolname ,toolvalidation} = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getToolDetail}`, payload, headers);
        const actParams = this.tool.config.params ? this.tool.config.params : [];
        const mstParams = apiconfig && apiconfig.params ? apiconfig.params : this.tool.params;
        this.tool.params = [...getParamsPair(mstParams), ...getParamsPair(actParams)];
        this.tool.path = apiconfig && apiconfig.path ? apiconfig.path : '';
        this.tool.dependentFiles = apiconfig && apiconfig.dependentFiles ? apiconfig.dependentFiles : [];
        this.tool.toolTypeId = tooltypeid || '';
        this.tool.toolOutputId = tooloutputid || '';
        this.tool.toolName = toolname || '';
        this.tool.toolvalidation = toolvalidation || '';
    }

    async getSoftwarePath() {
        this.tool.path = await softwareHelper.getSoftwarePath(this.tool.path);
        if (!this.tool.path) throw 'Executable path not found';
    }

    async getSoftwarePaths() {
        this.tool.paths = await softwareHelper.getSoftwarePaths(this.tool.path);
        if (!this.tool.paths) throw 'Executable path not found';
    }

    async isValidFile(basePath, path, isRoot, typeId, typeName, files, pageRange) {
        return new Promise(async (resolve, reject) => {
            try {
                if (this.clientUtility.activityDetails.validationFileConfig[typeId]) {
                    const payload = {
                        validationFiles: this.clientUtility.activityDetails.validationFileConfig[typeId].files || [],
                        file: { path, basePath, isRoot },
                        files: files.map((file) => { return { path: file.path, uuid: file.uuid } }),
                        placeHolders: { ...this.clientUtility.activityDetails.placeHolders, ... { FileTypeName: typeName, PageRange: pageRange } },
                        customer: this.clientUtility.activityDetails.customer
                    };
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    // const isValidFile = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.isValidFile}`, payload, headers);
                    // resolve(isValidFile);
                    resolve(this._isValidFile(payload));

                } else {
                    resolve({ isValid: false, isAlreadyExist: false });
                }
            }
            catch (e) {
                global.log(e, 'validation file error');
                reject(e);
            }
        });
    }

    _isValidFile = (payload) => {
        const { validationFiles, file, files, placeHolders, customer } = payload;
        const response = { isValid: false, isAlreadyExist: false, name: '', existedFileInfo: { name: '', uuid: '' }, lwfDetails: { name: '', src: '' } };
        for (let i = 0; i < validationFiles.length; i++) {
            const validationFile = validationFiles[i];
            const isMandatory = validationFile.mandatoryCheck ? (!!validationFile.mandatoryCheck[actions.save] || !!validationFile.mandatoryCheck[actions.reject] || !!validationFile.mandatoryCheck[actions.pending]) : false;
            const isOptional = !!validationFile.mandatoryCheck && !isMandatory;
            // lwf changes for cup
            // const lwfDetails = customer.id != '1' ?  validationFile.lwf && validationFile.lwf.src ? {
            //     src: validationFile.lwf.src, isRoot: !!validationFile.lwf.isRoot} : { src: '', isRoot: false } : { src: '', isRoot: false };
            const lwfDetails = { src: '', isRoot: false };
            if (!isMandatory && !isOptional) continue;
            let name = validationFile.name ? (validationFile.name[0] == '/' ? validationFile.name.substring(1) : validationFile.name) : '*';
            let formattedName = validationFile.name ? getFormattedName(name, placeHolders) : '';
            let formattedLWFSrcName = lwfDetails.src ? getFormattedName(lwfDetails.src, placeHolders) : '';
            const { path, basePath, isRoot = false } = file;
            let pattern = lwfDetails.src ? formattedLWFSrcName : formattedName;
            pattern = pattern ? (pattern[0] == '/' ? pattern.substring(1) : pattern) : '*'
            response.isValid = isRoot == lwfDetails.isRoot && micromatch.isMatch(path, pattern) && !pattern.includes('{{');
            if (response.isValid) {
                response.lwfDetails = { name: formattedName, src: formattedLWFSrcName };
                response.name = formattedName;
                let _path = lwfDetails.src ? formattedName : file.path;
                const matchedFile = files.find(fileData => fileData.path == basePath + _path);
                response.isAlreadyExist = matchedFile ? true : false;
                if (response.isAlreadyExist) {
                    response.existedFileInfo.name = matchedFile.path;
                    response.existedFileInfo.path = matchedFile.path;
                    response.existedFileInfo.uuid = matchedFile.uuid;
                }
                break;
            }
        }
        return response;
    }
    updateNewFileName = (data, incomingFileId,clientUtility={}) => {
        return new Promise(async (resolve, reject) => {
            try {
                // let tempData = data.split('"');
                if (data.includes('PDF_Name') || data.includes('Package Name')) {
                    let tempData = data.split('=')
                    var newFile = ''
                    if (tempData && tempData[0] == 'Package Name') {
                        newFile = data.replace('Package Name=', "")
                        newFile = newFile.replaceAll("\'", "")
                        newFile = basename(newFile)
                        var ext = extname(newFile)
                        newFile = newFile.replace(ext, "")
                    } else {
                        newFile = tempData[1].split('"')[1]
                    }
                    const payload = {
                        incomingFileId: incomingFileId,
                        newFileName: tempData[0] == 'Package Name' ? newFile : tempData[1].split('"')[1]
                    };
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    if ((tempData[0] == 'PDF_Name' || tempData[0] == 'Package Name') && tempData[1] && newFile) {
                        try {
                            // const updateNewFileName = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateNewFileName}`, payload, headers);
                            clientUtility.activityDetails.placeHolders= { ...clientUtility.activityDetails.placeHolders, ManuscriptZipName: newFile }
                            resolve(updateNewFileName)
                        } catch (error) {
                            reject("Fail to update New File Name")
                        }
                    } else {
                        reject("Text file not in format")
                    }
                }
                else {
                    reject("Text file not in format")
                }
            }
            catch (error) {
                global.log("updateNewFileName", error);
                reject(error.message ? error.message : error);
            }
        });
    }

    async processInputFiles() {
        // let inputFileStatus,InputParams ;
        // if(!this.clientUtility.activityDetails.iscamundaflow){
        //     let file = this.tool.fileConfig.input[0]
        //     let params=this.tool.fileConfig.input.params
            
        //    let srcName =  getFormattedName(file.name,clientUtility.activityDetails.placeHolders)
        //     if(params == undefined){
        //         params = clientUtility.activityDetails.toolsConfig.tools[clientUtility.activityDetails.selectedTool]?.params;
        //     }
        //     params = getParamsPair(params);
        //     console.log(params)
        //     params.forEach(param=> 
        //     {
        //         const _params = getFormattedParams(param, { ...clientUtility.activityDetails.placeHolders, __FILE__:extendedJoin([clientUtility.activityDetails.placeHolders.__WF__ ,srcName])});
        //         InputParams = [..._params];
        //     })

        //     inputFileStatus=InputParams
            
        
        // }
        
     let inputFileStatus, InputParams = [];
if (!this.clientUtility.activityDetails.iscamundaflow) {
    let file = this.tool.fileConfig.input[0];
    let params = this.tool.fileConfig.input.params || 
                 this.clientUtility.activityDetails.toolsConfig.tools[this.clientUtility.activityDetails.selectedTool]?.params;
    let isFile =params.filter(a => a.includes('FILE')).length? true:false
    if(this.tool.fileConfig.input.filter(a=> a.isS3Upload).length)
    {
        let fileName= this.tool.fileConfig.input.map(file => file.newZipName);
       let newFileName =getFormattedName(fileName[0], this.clientUtility.activityDetails.placeHolders);
        let validfile=  extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, newFileName])
        
            let data = await readSmallFile(validfile)
                    await this.updateNewFileName(data,clientUtility.activityDetails.fileType.fileId,this.clientUtility);
                    clientUtility.updateFileDetails = true; 

    }
    if(this.tool.fileConfig.input.filter(file => file.newZipName).length)
     {
            let fileName= this.tool.fileConfig.input.map(file => file.newZipName);
           let newFileName =getFormattedName(fileName[0], this.clientUtility.activityDetails.placeHolders);
            let validfile=  extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, newFileName])
            
                let data = await readSmallFile(validfile)
                        await this.updateNewFileName(data,clientUtility.activityDetails.fileType.fileId,this.clientUtility);
                        clientUtility.updateFileDetails = true; 
    
    }
    let srcName = getFormattedName(file.name, this.clientUtility.activityDetails.placeHolders);
    params = getParamsPair(params);
    InputParams = params ? params.map(param =>
        getFormattedParams(param, {
            ...this.clientUtility.activityDetails.placeHolders,
            __FILE__: extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, srcName])
        })
    ) : [];

    if (isFile) {

        let filepath = extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, srcName]).replace(new RegExp(/\\/, 'g'), '/');
        let localFolder = await retreiveLocalFiles(extendedJoin([this.clientUtility.activityDetails.placeHolders.__WF__, '**', '*']));
        const srcFiles = micromatch(localFolder, filepath).map(file => extendedJoin([file]));
        if (srcFiles.length > 0 || isPathExist(filepath)) {
            this.tool.params = InputParams.reduce((acc, curr) => acc.concat(curr), []);
            console.log(this.tool.params)
        } else {
            throw `Mandatory tool Input file ${srcName} missing in working folder`
        }
    }else{
        this.tool.params =  InputParams.reduce((acc, curr) => acc.concat(curr), []);
        console.log(this.tool.params)
    }
    
}
        
        else{
            inputFileStatus= await this.fetchToolsFileDetails(this.tool.fileConfig.input);
            if(Object.keys(this.clientUtility.activityDetails.placeHolders).includes('TocFile')  && this.clientUtility.activityDetails.placeHolders.TocFile == 'Yes'){
                console.log(inputFileStatus)
                let fileteredInputFileStatus = inputFileStatus.missedFileType.filter((list)=> list.typeId.includes('17'))
                inputFileStatus.params = inputFileStatus.params.filter((list)=> list.value.includes('TOC'))

                if(fileteredInputFileStatus.length >0){
                    this.validateFile(fileteredInputFileStatus);
    
                }
            }else{
                if(this.clientUtility.activityDetails.customer.id == '13'){
                let index1 = inputFileStatus.missedFileType.findIndex((list)=> list.typeId.includes(17))
                if (index1 != -1){
                    inputFileStatus.missedFileType = inputFileStatus.missedFileType.splice(0,index1)
                }
                let indexparams1 = inputFileStatus.params.findIndex((list)=> list.value.includes('TOC'))
                if(indexparams1 != -1){
                    inputFileStatus.params = inputFileStatus.params.splice(0,indexparams1)
                }
                if(inputFileStatus.length >0){
                    this.validateFile(inputFileStatus);
    
                }
            }else{
                this.validateFile(inputFileStatus);

            }
    
            }        this.tool.params = inputFileStatus.params;
        await copyIOFiles(inputFileStatus.files);
        };

    }

    async processOutputFiles() {
        let outputFileStatus = await this.fetchToolsFileDetails(this.tool.fileConfig.output);
        await copyIOFiles(outputFileStatus.files);
    }

    async executeTool(payload) {
        return new Promise(async (resolve, reject) => {
            let output = {
                isSuccess: false,
                msg: ''
            }
            const params = getParamsValue(this.tool.params);
            try {
                output.isSuccess = true;
                //  // output.msg = await execute(this.tool.path, params);

                var fileTypeDetails = await this.getIncomingFileTypeDetails(this.clientUtility);
                console.log(fileTypeDetails, "fileTypeDetails")
                var Output1;
                Output1 = await execute(this.tool.path, params);
                console.log(Output1, "Output1")
                output.msg = Output1.Message
                var successMsg = Output1.isSuccess == true ? Output1.Message : ""
                var errorMsg = Output1.isSuccess == false ? Output1.Message : ""
                   
                                    if (errorMsg != null && this.clientUtility.activityDetails.wfId == 29 ) {
                                        let workingPath = path.join(this.clientUtility.pathDetails.client.path, 'toolError.txt');
                                        fs.writeFile(workingPath, errorMsg, err => {
                                            if (err) {
                                                console.error('Error writing tools error file:', err);
                                                return;
                                            }
                                            console.log('Data written to file successfully.');
                                        });
                                    }
                output.msg = Output1.Message
                this.clientUtility.activityDetails.isInvokeTool= false
                this.clientUtility.activityDetails.iscamundaflow ? await this.preProcessing(payload):''
                await executeOutputFileValidation(this.tool, this.clientUtility, this.filesInfo, successMsg, errorMsg, fileTypeDetails)
                if (this.clientUtility && this.clientUtility.activityDetails && Object.keys(this.clientUtility.activityDetails).length > 0 && this.clientUtility.activityDetails.config &&
                    Object.keys(this.clientUtility.activityDetails.config).length > 0 && this.clientUtility.activityDetails.config.invokeNextServiceTool && Object.keys(this.clientUtility.activityDetails.config.invokeNextServiceTool).length > 0 &&
                    this.clientUtility.activityDetails.config.invokeNextServiceTool.DesktopToolId == this.tool.id && (this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId || this.clientUtility.activityDetails.config.invokeNextServiceTool.fileCheck.length > 0)) {
                    var lwfpath = this.clientUtility.pathDetails.client.path;

                    if (this.clientUtility.activityDetails.config.invokeNextServiceTool.isFileSequence) {
                        const dirPaths = await GetAllFiles(lwfpath)
                        const filteredPaths = dirPaths.map(path => {
                            if (path.includes('Chapter.docx')|| path.includes('matter.docx')) {
                                return basename(path, extname(path));
                            }
                            return null; // or you could filter out nulls in a second step
                        }).filter(result => result !== null);

                        console.log(filteredPaths)
                        const payload = {
                            file: filteredPaths,
                            woId: this.clientUtility.activityDetails.workOrderId
                        };
                        const headers = {
                            'Authorization': `Bearer ${config.server.getToken()}`
                        };
                        await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.addfileSequence}`, payload, headers);
                        reportLog = true
                    }
                    else {
                        if (isPathExist(lwfpath)) {
                            var errorOccures = []
                            var reportLog = false
                            const dirPaths = await GetAllFiles(lwfpath)
                            for (let j = 0; j < dirPaths.length; j++) {
                                for (let k = 0; k < this.clientUtility.activityDetails.config.invokeNextServiceTool.fileCheck.length; k++) {
                                    let fileDetails = this.clientUtility.activityDetails.config.invokeNextServiceTool.fileCheck[k];
                                    let placeHolders = { ...this.clientUtility.activityDetails.placeHolders }
                                    let fileName = getFormattedName(fileDetails.fileName, placeHolders)
                                    fileName = fileName.replace(/\//g, '\\');
                                    if (dirPaths[j].includes(fileName)) {
                                        reportLog = true
                                        var fileContent = await readSmallFile(dirPaths[j]);
                                        if (fileContent.includes(fileDetails.successMsg)) {
                                            errorOccures.push(fileDetails.successMsg)
                                        }
                                    }
                                }
                            }
                        }
                        if (!reportLog) {
                            throw `Output not generated! Please check output file.`
                        }
                        if (errorOccures.length > 0) {
                            await this.fetchFileStatus();
                            await this.uploadFiles()
                            //AI Co-Pilot Set isInvokeTool to true after uploading files 
                            this.clientUtility.activityDetails.isInvokeTool = true;
                            await onServiceTools(this.clientUtility, payload.activityDetails ? payload.activityDetails : payload, this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId);
                        } else {
                            throw 'Tool failed. Please check the log!'
                        }
                    }
                }
                if(this.tool.toolvalidation?.ValidateLog){
                    console.log('VvalidateFfile',this.tool.toolvalidation)
                     //AI Co-Pilot Set isInvokeTool to true after uploading files 
                    this.clientUtility.activityDetails.isInvokeTool= true
                    const dirPaths = await GetAllFiles(this.clientUtility.pathDetails.client.path)
                    let fileName = this.tool.toolvalidation?.ValidateFile || '';
                    let content = this.tool.toolvalidation?.errContent || '';
                    let errMsg = this.tool.toolvalidation?.errMessage ? this.tool.toolvalidation.errMessage  : 'Tool failed. Please check input file'
                    let fileContent=''
                    for (let j = 0; j < dirPaths.length; j++) {
                        if (dirPaths[j].includes(fileName)) {
                            fileContent = await readSmallFile(dirPaths[j]);
                            if (fileContent.includes(content)) {
                                output.isSuccess=true
                            }else{
                                output.isSuccess=false
                                output.msg=errMsg
                            }
                        }
                    }
                    if (output.isSuccess) {
                    if (this.clientUtility.activityDetails.config?.invokeNextTool?.length > 0) {
                       
                            // Loop over the array of service tool IDs
                            for (let i = 0; i < this.clientUtility.activityDetails.config.invokeNextTool.length; i++) {
                                let payload_ = {};
                                let toolDetails = {};
                    
                                // Get the tool ID from the config array
                                toolDetails.toolId = this.clientUtility.activityDetails.config.invokeNextTool[i];
                                toolDetails.wfEventId = this.clientUtility.activityDetails.wfEventId;
                    
                                // Prepare the payload
                                payload_ = {
                                    actionType: "sync_tools_file",
                                    isOut: false,
                                    activityDetails: toolDetails
                                };
                    
                                try {
                                    // Sync the tools file
                                    await new SyncToolsFile(this.clientUtility).startProcess(payload_);
                    
                                    // Call the service tool
                                    let response = await onServiceTools(this.clientUtility, payload.activityDetails ? payload.activityDetails : payload, toolDetails.toolId, true);
                                    await this.clientUtility.updateStatusToServer({ message: 'XMP updation and Pitstop Process Completed', progress: 70 }, 2);
                                    // Log the response from the service tool
                                    payload_ = {
                                        actionType: "sync_tools_file",
                                        isOut: true,
                                        activityDetails: toolDetails
                                    }
                                    this.clientUtility.isOut = true
                                    await new SyncToolsFile(this.clientUtility).startProcess(payload_);
                                    console.log(response);

                                } catch (error) {
                                    // Handle any errors that occur during the process
                                    console.error("Error processing tool:", error);
                                    reject(error)
                                }
                            }
                        }
                    } else {
                        throw new Error('Tool failed. Please check the log!');
                    }
                }
             resolve(output)
            } catch (err) {
                output.isSuccess = false;
                output.msg = err.message ? err.message : err;
                resolve(output);
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


    async getToolsFileDetail(validationFile, basePath, path, isRoot, typeId, typeName, files, pageRange) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    validationFile,
                    file: { path, basePath, isRoot },
                    files: files.map((file) => { return { path: file.path, uuid: file.uuid } }),
                    placeHolders: { ...this.clientUtility.activityDetails.placeHolders, ... { FileTypeName: typeName, PageRange: pageRange } }
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const fileDetail = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getToolsFileDetail}`, payload, headers);
                resolve(fileDetail);

            }
            catch (e) {
                global.log(e, 'getToolsFileDetail error');
                reject(e);
            }
        });
    }

    validateFile(fileStatus) {
        const files = [
            ...fileStatus.missedFile.map(file => file.srcName),
            ...fileStatus.missedFileType.map(file => `${file.srcName} (${this.getFileTypeNames(file.typeId)} Type Missing)`)
        ];
        if (files.length) throw `Following mandatory files are missing.\n ${files.join(', ')} `;
    }

    getFileTypeNames(typeId) {
        typeId = typeId instanceof Array ? typeId : [typeId];
        const fileTypeDetail = this.fileTypes.filter(ft => typeId.includes(parseInt(ft.filetypeid)));
        return fileTypeDetail.length ? fileTypeDetail.map(ft => ft.filetype).join(', ') : '';
    }

    async fetchToolsFileDetails(io) {
        return await fetchFileCopyDetails(io, this.clientUtility, this.filesInfo.data);
    }

    async copyToolsDependentFiles() {
        const fileStatus = await fetchFileCopyDetails(this.tool.dependentFiles, this.clientUtility, this.filesInfo.data);
        const os = require('os');
        global.clientUtility = this.clientUtility
        if (os.platform() == "win32" && this.software && this.software.detail && this.software.detail.isAdminCopy) {
            await copyIOFilesWithImpersonator(fileStatus.files, true);
        }
        else {
            await copyIOFiles(fileStatus.files, true);
        }
        if (this.clientUtility.activityDetails.selectedTool == 256 || this.clientUtility.activityDetails.selectedTool == 257) {
            await copyDependanceFiles(fileStatus.files, this.clientUtility)
        }
    }

    async getToolsStatusForServiceTask() {
        return new Promise(async (resolve, reject) => {
            try {
                const filePayload = {
                    wfeventId: this.clientUtility.activityDetails.wfEventId,
                    toolId: this.clientUtility.activityDetails.config.invokeNextServiceTool.serviceToolId
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const FileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.getToolsStatusForServiceTask}`, filePayload, headers);
                resolve(FileDetails)
            } catch (e) {
                global.log('error in fetching incoming file details')
                reject(e)
            }
        })
    }
}


module.exports = {
    ClientTool
};