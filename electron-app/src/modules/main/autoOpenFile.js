const { openFolder } = require('../utils/explorer/index');
const { getChecksum } = require('../utils/index');
const { isPathExist, makeDir, extendedJoin, getFormattedName, readDir } = require('../utils/io');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { post } = require('../http/index');
const { dirname, basename, join, extname } = require('path');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { preProcessing } = require('./preprocessing');
const softwareHelper = require('./../utils/software');
const { execute, getFileTypeNames, GetAllFiles } = require('../utils/process');
const { copyIOFiles, copyIOFilesWithImpersonator, fetchFileCopyDetails } = require('./copyFiles');
const pLimit = require('p-limit');
const limit = pLimit(10);
const os = require('os');
class AutoOpenFile {
    fileStatus = {
        download: [],
        downloaded: [],
        new: []
    };
    exeId = {
        '.pdf': 1,
        '.xml': 5,
        '.docx': 6,
        '.doc': 6,
        '.htm': 8,
        '.html': 8,
        '.3d': 9,
        '.ps': 5,
        '.err': 5,
        '.log': 5,
        '.txt': 5
    };
    explorerPath = null;
    filesInfo = {
        folderName: null,
        isFileCopy: null,
        actFileMapId: null,
        key: null,
        data: []
    };
    software = {
        detail: {},
        appId: null,
        path: null,
        config: {}
    }
    openSoftwareWithoutFiles = null;
    softwareSupportingFiles = [];

    fileTypes = [];
    userId = null;
    wf = null;
    tool = {
        wf: null,
        apiId: null,
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
        ext: null,
        formattedExt: [],
        actFileMapId: null,
        appId: null,
        data: [],
        missedFiles: []
    };
    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }

    startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.clientUtility.updateStatusToServer({ message: 'Fetching File Details', progress: 30 }, 2);
                payload.filesInfo.appId = this.exeId[payload.filesInfo.ext]
                await this.fetchDetails(payload);
                await this.clientUtility.updateStatusToServer({ message: 'Fetched File Details', progress: 35 }, 2);
                // await this.clientUtility.updateStatusToServer({ message: 'Preparing API', progress: 35 }, 2);
                // await this.createAPI();
                if(this.clientUtility.activityDetails.iscamundaflow){
                    await this.fetchFileStatus();
                }else{ 
                    this.tool.fileConfig.output.forEach((list) =>{
                        list.name =  getFormattedName(list.name,this.clientUtility.activityDetails.placeHolders);
                        this.fileStatus.new.push(list.name)
                    });
                }
                await this.clientUtility.updateStatusToServer({ message: 'Prepared API', progress: 40 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Copying Dependent Files', progress: 40 }, 2);
                if(this.clientUtility.activityDetails.iscamundaflow){
                    await this.copySupportingFiles();
               }
                await this.clientUtility.updateStatusToServer({ message: 'Copied Dependent Files', progress: 50 }, 2);
                // await this.getSoftwarePath();
                // await this.getSoftwarePaths();
                await this.clientUtility.updateStatusToServer({ message: 'Processing Input Files', progress: 50 }, 2);
                // await this.processInputFiles();
                this.validateSupportedFile();
                await this.clientUtility.updateStatusToServer({ message: 'Processed Input Files', progress: 60 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Updating API', progress: 60 }, 2);
                // await this.updateAPI();
                await this.processOutputFiles();
                // await this.openFiles();
                // this.clientUtility.updateFileDetails = true;
                await this.clientUtility.updateStatusToServer({ message: 'Completed API', progress: 90 }, 2);
                resolve();
            } catch (err) {
                if (this.tool.apiId) await this.completeAPI({ isSuccess: false, msg: err.message ? err.message : err });
                global.log(err, 'Sync');
                reject(err);
            }
        });
    }


    async fetchDetails(payload) {
        this.fetchPayoadDetails(payload);
         await this.fetchFileDetails()
        await this.fetchSoftwareDetails();

    }

    async copySupportingFiles() {
        const supportingFiles = this.software.config.supportingFiles ? this.software.config.supportingFiles : []
        const fileStatus = await fetchFileCopyDetails(supportingFiles, this.clientUtility, this.filesInfo.data);
        const os = require('os');
        global.clientUtility = this.clientUtility
        if (os.platform() == "win32" && this.software && this.software.detail && this.software.detail.isAdminCopy) {
            await copyIOFilesWithImpersonator(fileStatus.files, true);
        }
        else {
            await copyIOFiles(fileStatus.files, true);
        }
    }
    fetchPayoadDetails(payload) {
        const { activityDetails, filesInfo } = payload;
        this.tool.id = activityDetails.toolId;
        this.userId = activityDetails.userId;
        const config = this.clientUtility.activityDetails.toolsConfig;
        const toolConfig = (config['tools'] && config['tools'][this.tool.id]) ? config['tools'][this.tool.id] : {};
        this.tool.fileConfig.input = toolConfig.files && toolConfig.files.input ? toolConfig.files.input :toolConfig.files.filter(x=>(x.fileFlowType||[]).includes("IN"));
        this.tool.fileConfig.output = toolConfig.files && toolConfig.files.output ? toolConfig.files.output :toolConfig.files.filter(x=>(x.fileFlowType||[]).includes("OUT"));
        this.tool.config = toolConfig;
        this.tool.runAsSoftware = !!toolConfig.runAsSoftware;
        this.wf = extendedJoin([this.clientUtility.pathDetails.client.path], false);
        this.filesInfo.ext = filesInfo.ext;
        this.filesInfo.formattedExt = filesInfo.ext.split(';').map(ext => ext.trim()).filter(ext => ext);
        this.filesInfo.actFileMapId = filesInfo.actFileMapId;
        this.filesInfo.appId = filesInfo.appId;
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]) };
    }

    async processOutputFiles() {
        let clientUtility = this.clientUtility
        let tools = this.tool
        let outputValidation = []
        var name, fileName, filePath, fileData;
        var lwfpath = clientUtility.pathDetails.client.path;

        // let outputFileStatus = await this.fetchToolsFileDetails(tools.fileConfig.output);
        var fileTypeDetails = await this.getIncomingFileTypeDetails(clientUtility);
        let output = (tools.config.files || []).filter(
          (x) => x.fileopen === true
        );
        for (let j = 0; j < output.length; j++) {
            fileData = output[j];
            //if (fileData.isCommon) {
            for (let index = 0; index < fileData.fileTypes.length; index++) {
                const element = fileData.fileTypes[index];
                name = await getFileTypeNames(element, fileData.name, this.filesInfo, fileTypeDetails);
                if (name && Object.keys(name).length > 0 && (name.FileTypeName != null || name.PageRange != null)) {
                    clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, FileTypeName: name.FileTypeName, PageRange: name.PageRange }
                        fileName = getFormattedName(fileData.name, clientUtility.activityDetails.placeHolders);
                        filePath = join(clientUtility.pathDetails.client.path, fileName)
                    
                    
                    let isExist = isPathExist(filePath)
                    let extName = extname(filePath);
                    if (isExist && this.software.detail.apptype.includes(extName)) {
                        softwareHelper.openFile(filePath, this.software.path);
                    }
                }
            }
            // } else {
            //     if (fileData.fileopen) {
            //         outputValidation = tools.config.files.output[Object.keys(tools.config.files.output)[j]].typeId
            //         if (outputValidation && outputValidation.length >= 1) {
            //             for (let k = 0; k < tools.config.files.output[Object.keys(tools.config.files.output)[j]].typeId.length; k++) {
            //                 name = await getFileTypeNames(tools.config.files.output[Object.keys(tools.config.files.output)[j]].typeId[k], tools.config.files.output[Object.keys(tools.config.files.output)[j]].name, this.filesInfo, fileTypeDetails);

            //                 if (fileData.name.includes('*')) {
            //                     if (isPathExist(lwfpath)) {
            //                         var commonFile = await GetAllFiles(lwfpath)
            //                         for (let i = 0; i < commonFile.length; i++) {
            //                             let compath = commonFile[i]
            //                             for (let j = 0; j < tools.config.files.outputFileValidation.length; j++) {
            //                                 outputValidation = tools.config.files.outputFileValidation[j].typeId
            //                                 if (isPathExist(compath)) {
            //                                     for (let k = 0; k < tools.config.files.outputFileValidation[j].typeId.length; k++) {
            //                                         if ('isPattern' in tools.config.files.outputFileValidation[j] && tools.config.files.outputFileValidation[j].isPattern) {
            //                                             let regExp = '[a-zA-Z0-9]+';
            //                                             let name = tools.config.files.outputFileValidation[j].name;
            //                                             if (name.includes('*')) {
            //                                                 var formattedFileName = name.replace('*', regExp);
            //                                                 formattedFileName = formattedFileName.replace("/", "\\\\")
            //                                                 var regex = new RegExp(formattedFileName, "g")
            //                                                 var patternedName = regex.test(compath)
            //                                                 if (patternedName) {
            //                                                     let isExist = isPathExist(compath);
            //                                                     if (isExist) {
            //                                                         softwareHelper.openFile(compath, this.software.path);
            //                                                     }
            //                                                 }
            //                                             }
            //                                         }
            //                                     }
            //                                 }
            //                             }

            //                         }
            //                     }
            //                 }

            //                 else {
            //                     if (name && Object.keys(name).length > 0 && (name.FileTypeName != null || name.PageRange != null)) {

            //                         clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, FileTypeName: name.FileTypeName, PageRange: name.PageRange }
            //                         fileName = tools.config && tools.config.files && tools.config.files.output && tools.config.files.output[Object.keys(tools.config.files.output)[j]] != undefined && getFormattedName(tools.config.files.output[Object.keys(tools.config.files.output)[j]].name, clientUtility.activityDetails.placeHolders);
            //                         filePath = join(clientUtility.pathDetails.client.path, fileName)
            //                         let isExist = isPathExist(filePath)
            //                         let extName = extname(filePath);
            //                         if (isExist && this.software.detail.apptype.includes(extName)) {
            //                             softwareHelper.openFile(filePath, this.software.path);
            //                         }
            //                     }
            //                 }

            //             }
            //         } else if (outputValidation) {
            //             name = await getFileTypeNames(tools.config.files.output[Object.keys(tools.config.files.output)[j]].typeId, tools.config.files.output[Object.keys(tools.config.files.output)[j]].name, this.filesInfo, fileTypeDetails);
            //             if (name && Object.keys(name).length > 0 && (name.FileTypeName != null || name.PageRange != null)) {
            //                 clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, FileTypeName: name.FileTypeName, PageRange: name.PageRange }
            //                 fileName = tools.config && tools.config.files && tools.config.files.output && tools.config.files.output[Object.keys(tools.config.files.output)[j]] != undefined && getFormattedName(tools.config.files.output[Object.keys(tools.config.files.output)[j]].name, clientUtility.activityDetails.placeHolders);
            //                 filePath = join(clientUtility.pathDetails.client.path, fileName)
            //                 let isExist = isPathExist(filePath)
            //                 let extName = extname(filePath);
            //                 if (isExist && this.software.detail.apptype.includes(extName)) {
            //                     softwareHelper.openFile(filePath, this.software.path);
            //                 }
            //             }

            //         }
            //     }
            // }
        }
    }
    async fetchToolsFileDetails(io) {
        return await fetchFileCopyDetails(io, this.clientUtility, this.filesInfo.data);
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
            eventData: this.clientUtility.activityDetails.eventData

        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, filesAdditionalInfo, validationFileConfig, softwareDetails } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.filesInfo.missedFiles = filesAdditionalInfo.missedFiles;
        this.clientUtility.activityDetails.software = softwareDetails;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
        if(filesAdditionalInfo?.extractedFiles.length > 0){
            // let updatedPayload = filesAdditionalInfo?.extractedFiles.filter(file => (file.fileFlowType || []).filter(x => x.toLocaleLowerCase() === "out").length > 0);
            //  updatedPayload =await this.updateCopyPaths(updatedPayload);
            this.filesInfo.extractedFiles  = filesAdditionalInfo?.extractedFiles
            this.clientUtility.activityDetails.newFileCopyBasePath  =filesAdditionalInfo?.newFileCopyBasePath
        }
    }



    async fetchSoftwareDetails() {
        const softwareDetail = this.clientUtility.activityDetails.software.find((tool) => tool.appid == this.filesInfo?.appId) ||
        this.clientUtility.activityDetails.software.find((tool) => tool.apptype.split(';').map(ext => ext.trim()).filter(ext => ext).includes(this.filesInfo.ext));
        if (!softwareDetail) {
            throw 'Software is not mapped';
        } else {
            this.software.detail = softwareDetail;
            this.software.path = await this.getSoftwarePath(softwareDetail.appurlpath, this.filesInfo.ext);
            this.software.paths = await this.getSoftwarePaths(softwareDetail.appurlpath, this.filesInfo.ext);
            this.software.appId = softwareDetail.appid;
            this.software.config = (this.clientUtility.activityDetails.softwareConfig['software'] && this.clientUtility.activityDetails.softwareConfig['software'][this.software.appId]) ? this.clientUtility.activityDetails.softwareConfig['software'][this.software.appId] : {};
            this.openSoftwareWithoutFiles = !!this.software.config.openSoftwareWithoutFiles;
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __SP__: extendedJoin([dirname(this.software.path)]) };
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __SPS__: this.software.paths.map(pth => extendedJoin([dirname(pth)])) };
        }
    }
    preProcessing(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await preProcessing(this.filesInfo, this.clientUtility, this.action, 'copylinkingfile');
                await this.fetchDetails(payload);
                resolve();
            } catch (err) {
                reject(err)
            }
        });
    }

    async getSoftwarePath(softwarePath, ext) {
        if (softwarePath) {
            const path = await softwareHelper.getSoftwarePath(softwarePath);
            if (path) {
                return path;
            } else {
                throw `No software found to open the file (${ext})`;
            }
        } else {
            throw `No software was not mapped to open the file (${ext})`;
        }
    }

    async getSoftwarePaths(softwarePath, ext) {
        if (softwarePath) {
            const path = await softwareHelper.getSoftwarePaths(softwarePath);
            if (path) {
                return path;
            } else {
                throw `No software found to open the file (${ext})`;
            }
        } else {
            throw `No software was not mapped to open the file (${ext})`;
        }
    }


    async openFiles() {
        if (this.openSoftwareWithoutFiles) {
            await this.openFileInSoftware([]);
        } else {

            if (this.fileStatus.download.length) {
                for (let i = 0; i < this.fileStatus.download.length; i++) {
                    await this.openFile(this.fileStatus.download[i]);
                }
            }
            if (this.fileStatus.downloaded.length) {
                for (let i = 0; i < this.fileStatus.downloaded.length; i++) {
                    await this.openFile(this.fileStatus.downloaded[i]);
                }
            }
            if (this.fileStatus.new.length) {
                for (let i = 0; i < this.fileStatus.new.length; i++) {
                    await this.openFile(this.fileStatus.new[i]);
                }
            }
        }
    }

    async openFile(fileData) {
        const { folderPath, name } = fileData;
        const filePath = extendedJoin([folderPath, name]);
        await this.openFileInSoftware(filePath)
    }


    async openFileInSoftware(path) {
        softwareHelper.openFile(path, this.software.path);
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

    validateSupportedFile() {
        if (!this.openSoftwareWithoutFiles) {
            const files = [...this.fileStatus.new, ...this.fileStatus.download, ...this.fileStatus.downloaded];
            if (!files.length) throw 'No supported file found';
        }
    }
    async fetchFileStatus() {
        if (this.filesInfo.actFileMapId) {
            let file = {};
            let filesData = {};
            for (let i = 0; i < this.filesInfo.data.length; i++) {
                let matchedFile = this.filesInfo.data[i].files.find((file) => file.actfilemapid === this.filesInfo.actFileMapId);
                if (matchedFile) {
                    file = matchedFile;
                    filesData = this.filesInfo.data[i];
                    break;
                }
            }
            const okmFolderStructure = filesData.basePath;
            const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, filesData.name, '/']);
            const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
            const { uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isFolder, folderName } = file;
            // const localPath = lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
            //     (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, file.path.replace(okmFolderStructure, '')]);
            // lwf changes for cup
            // const localPath =  Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]) : lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
            // (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, file.path.replace(okmFolderStructure, '')]);
            const localPath = extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]);
            // const folderPath = extendedJoin([dirname(localPath), '/']);
            // lwf changes for cup
            //const folderPath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath]) :  isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]): folderStructureWithRoot : extendedJoin([dirname(localPath), '/'])
            const folderPath = isFolder && folderName && folderRelativePath ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path, '')]) : folderStructureWithRoot;
            const isExist = isPathExist(localPath);
            const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
            const fileDetails = { name: basename(localPath), relativeSrc, folderPath: folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
            this.explorerPath = folderPath;
            if (!isExist) {
                this.fileStatus.download.push(fileDetails);
            } else {
                if (overwrite) {
                    let srcChecksum = undefined, okmChecksum = undefined;
                    let awt = [];
                    awt.push(getChecksum(localPath).then(val => { srcChecksum = val; }).catch(err => { }));
                    switch (this.clientUtility.activityDetails.dmsType) {
                        case "azure":
                            awt.push(azureHelper.getChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                            break;
                        case "local":
                            awt.push(localHelper.getlocalChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                            break;
                        default:
                            awt.push(okmHelper.getChecksum(uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                            break;
                    }
                    await Promise.all(awt);
                    if (srcChecksum == okmChecksum) {
                        this.fileStatus.downloaded.push(fileDetails);
                    } else {
                        this.fileStatus.download.push(fileDetails);
                    }
                } else {
                    this.fileStatus.downloaded.push(fileDetails);
                }
            }
        } else if (this.filesInfo.key) {
            let filesData = this.filesInfo.data.find(fData => fData.key == this.filesInfo.key);
            const { files } = filesData
            const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, filesData.name, '/']);
            const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
            const okmFolderStructure = filesData.basePath;
            let isLwf = false;
            const filteredFiles = files.filter((file) => file.isFolder && file.folderName == this.filesInfo.folderName);
            for (let i = 0; i < filteredFiles.length; i++) {
                const file = filteredFiles[i];
                const { path, uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isFolder, folderName } = file;
                const localPath = extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]);
                if (!isLwf) isLwf = lwfDetails.src ? true : false;
                const folderPath = isFolder && folderName && folderRelativePath ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path, '')]) : folderStructureWithRoot;
                const isExist = isPathExist(localPath);
                const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                const fileDetails = { name: basename(localPath), relativeSrc, folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
                if (!isExist) {
                    this.fileStatus.download.push(fileDetails);
                } else {
                    if (overwrite) {
                        let srcChecksum = undefined, okmChecksum= undefined;
                        let awt = [];
                        awt.push(getChecksum(localPath).then(val => { srcChecksum = val; }).catch(err => { }));
                        switch (this.clientUtility.activityDetails.dmsType) {
                            case "azure":
                                awt.push(azureHelper.getChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                                break;
                            case "local":
                                awt.push(localHelper.getlocalChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                                break;
                            default:
                                awt.push(okmHelper.getChecksum(uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                                break;
                        }
                        await Promise.all(awt);
                        if (srcChecksum == okmChecksum) {
                            this.fileStatus.downloaded.push(fileDetails);
                        } else {
                            this.fileStatus.download.push(fileDetails);
                        }
                    } else {
                        this.fileStatus.downloaded.push(fileDetails);
                    }
                }
            }
            this.explorerPath = isLwf ? this.clientUtility.pathDetails.client.path : (folderStructure + this.filesInfo.folderName);
        } else {
            for (let i = 0; i < this.filesInfo.data.length; i++) {
                const { name: fileTypeName, basePath, typeId, files } = this.filesInfo.data[i];
                const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                const okmFolderStructure = basePath;
                for (let j = 0; j < files.length; j++) {
                    const file = files[j];
                    const { path, uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isFolder, folderRelativePath, folderName } = file;
                    // const localPath = lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                    //     (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, path.replace(okmFolderStructure, '')]);
                    // lwf changes for cup
                    // const localPath =  Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ?  extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]) 
                    // : lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                    // (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, path.replace(okmFolderStructure, '')]);
                    const localPath = extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]);
                    // const folderPath = extendedJoin([dirname(localPath), '/']);
                    // lwf changes for cup
                    //const folderPath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]) :   folderStructureWithRoot : extendedJoin([dirname(localPath), '/'])
                    const folderPath = isFolder && folderName && folderRelativePath ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path, '')]) : folderStructureWithRoot;
                    const isExist = isPathExist(localPath);
                    const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                    const fileDetails = { path, name: basename(localPath), relativeSrc, folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
                    if (!isExist) {
                        this.fileStatus.download.push(fileDetails);
                    } else {
                        if (overwrite) {
                            let srcChecksum = undefined, okmChecksum = undefined;
                            let awt = [];
                            awt.push(getChecksum(localPath).then(val => { srcChecksum = val; }).catch(err => { }));
                            switch (this.clientUtility.activityDetails.dmsType) {
                                case "azure":
                                    awt.push(azureHelper.getChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                                    break;
                                case "local":
                                    awt.push(localHelper.getlocalChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                                    break;
                                default:
                                    awt.push(okmHelper.getChecksum(uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                                    break;
                            }
                            await Promise.all(awt);
                            if (srcChecksum == okmChecksum) {
                                this.fileStatus.downloaded.push(fileDetails);
                            } else {
                                this.fileStatus.download.push(fileDetails);
                            }
                        } else {
                            this.fileStatus.downloaded.push(fileDetails);
                        }
                    }
                }
            }
            this.explorerPath = this.clientUtility.pathDetails.client.path;
        }
    }

    async createFolder(path) {
        if (!isPathExist(path)) await makeDir(path);
    }

    async downloadFiles() {
        const progressDetails = {
            currentProgress: 40,
            fileProgress: 40 / this.fileStatus.download.length,
            completedFileCount: 0,
            totalFileCount: this.fileStatus.download.length
        }
        if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloading Files', progress: 40 }, 2);
        if (this.fileStatus.download.length) {
            let FileToDownload = this.fileStatus.download.filter(file => {
                if (this.clientUtility.activityDetails.config.skipFileExtension || this.clientUtility.activityDetails.config.allowedFileExtension) {
                    let skipFile = this.clientUtility.activityDetails.config.skipFileExtension ? (this.clientUtility.activityDetails.config.skipFileExtension.filter((data) => file.name.includes(data)).length > 0 ? true : false) : false;
                    let allowedFileExtension = this.clientUtility.activityDetails.config.allowedFileExtension ? (this.clientUtility.activityDetails.config.allowedFileExtension.filter((data) => file.name.includes(data)).length > 0 ? true : false) : true;
                    console.log(skipFile)
                    if (skipFile || !allowedFileExtension) {
                        return false;
                    } else {
                        return true;
                    }
                } else {
                    return true;
                }
            });
            let awt = [];
            for (let i = 0; i < FileToDownload.length; i++) {
                awt.push(limit(() => FileDownloadFun(FileToDownload[i], this)));
            }
        }
        if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloaded Files', progress: 80 }, 2);

        async function FileDownloadFun(file, _this) {
            return new Promise(async(resolve,reject)=>{
                try {
                    await _this.updateDownloadProgressDetails(file, progressDetails, true);
                    await _this.downloadFile(file);
                    await _this.updateDownloadProgressDetails(file, progressDetails, false);
                    resolve();
                } catch (error) {
                 reject(error);   
                }
            })
        }
    }

    async updateDownloadProgressDetails(file, progressDetails, isDownloading) {
        if (isDownloading) {
            await this.clientUtility.updateStatusToServer({ message: `Downloading Files (${file.name}) (${progressDetails.completedFileCount + 1}/${progressDetails.totalFileCount})`, progress: progressDetails.currentProgress }, 2);
        } else {
            progressDetails.currentProgress = progressDetails.fileProgress + progressDetails.currentProgress;
            ++progressDetails.completedFileCount;
            await this.clientUtility.updateStatusToServer({ message: `Downloaded Files (${file.name}) (${progressDetails.completedFileCount}/${progressDetails.totalFileCount})`, progress: progressDetails.currentProgress }, 2);
        }
    }

    async downloadFile(fileData) {
        return new Promise(async(resolve,reject)=>{
            try {
                const { folderPath, name, uuid , path} = fileData;
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        await azureHelper.downloadFile(path, folderPath, name);
                        break;
                    case "local":
                        if(os.platform() == "win32" && isInternalConnection){
                            await localHelper.downloadLocalFileWithImpersonator(path, folderPath, name);
                        }else{
                            await localHelper.downloadlocalFile(path, folderPath, name);
                        }
                        break;
                    default:
                        await okmHelper.downloadFile(uuid, folderPath, name);
                        break;
                }      
                resolve();          
            } catch (error) {
                reject(error);
            }
        })
    }
}

module.exports = {
    AutoOpenFile
};