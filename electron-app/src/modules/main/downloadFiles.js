const { openFolder } = require('../utils/explorer/index');
const { getChecksum } = require('../utils/index');
const { isPathExist, makeDir, extendedJoin } = require('../utils/io');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { post } = require('../http/index');
const { dirname, basename } = require('path');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { preProcessing } = require('./preprocessing');
const pLimit = require('p-limit');
const limit = pLimit(10);
const os = require('os');
class DownloadFiles {
    fileStatus = {
        download: [],
        downloaded: [],
        new: []
    };
    explorerPath = null;
    filesInfo = {
        folderName: null,
        isFileCopy: null,
        actFileMapId: null,
        key: null,
        data: []
    };

    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }

    startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
               // await this.clientUtility.updateStatusToServer({ message: 'Fetching File Details', progress: 30 }, 2);
                await this.fetchDetails(payload);
               // await this.preProcessing(payload)
                //await this.clientUtility.updateStatusToServer({ message: 'Fetched File Details', progress: 35 }, 2);
                this.createFolder(this.clientUtility.pathDetails.client.path);
                await this.createFileTypeFolders();
                if (this.filesInfo.isFileCopy) {
                    //await this.clientUtility.updateStatusToServer({ message: 'Analyzing Files', progress: 35 }, 2);
                    await this.fetchFileStatus();
                    //await this.clientUtility.updateStatusToServer({ message: 'Analyzed Files', progress: 40 }, 2);
                    global.log(this.fileStatus.download.map((file) => file.folderPath + file.name), 'Download files');
                    await this.downloadFiles();
                }
                resolve();
            } catch (err) {
                global.log(err, 'DownloadFiles');
                reject(err);
            }
        });
    }

    async fetchDetails(payload) {
        this.fetchPayoadDetails(payload);
        await this.fetchFileDetails();
    }

    fetchPayoadDetails(payload) {
        const { filesInfo } = payload;
        this.filesInfo.actFileMapId = filesInfo.actFileMapId;
        this.filesInfo.isFileCopy = filesInfo.isFileCopy;
        this.filesInfo.key = filesInfo.key;
        this.filesInfo.folderName = filesInfo.folderName;
        this.wf = extendedJoin([this.clientUtility.pathDetails.client.path], false);
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]) };
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
            eventData : this.clientUtility.activityDetails.eventData

        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo,validationFileConfig } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
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

    async createFileTypeFolders() {
        this.explorerPath = this.clientUtility.pathDetails.client.path;
        for (let i = 0; i < this.filesInfo.data.length; i++) {
            if (this.clientUtility.activityDetails.validationFileConfig[this.filesInfo.data[i].typeId]) {
                let files = this.clientUtility.activityDetails.validationFileConfig[this.filesInfo.data[i].typeId].files;
                let createFolder = files.filter(x=>(x.custom||[]).filter(y=>y.toLocaleLowerCase()==="createfolder").length);
                for (let j = 0; j < createFolder.length; j++) {
                    const dirFolder = extendedJoin([
                        this.explorerPath,
                        createFolder[j].name,
                        "/",
                    ]);
                    if (!isPathExist(dirFolder)) await makeDir(dirFolder);
                }
            }
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
            const {path, uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isFolder, folderName} = file;
            // const localPath = lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
            //     (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, file.path.replace(okmFolderStructure, '')]);
            // lwf for cup 
                // const localPath =  Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]) : lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                // (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, file.path.replace(okmFolderStructure, '')]);
                 const localPath =  extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]);
            
                // const folderPath = extendedJoin([dirname(localPath), '/']);
                // lwf for cup
            // const folderPath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath]) :  isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]): folderStructureWithRoot : extendedJoin([dirname(localPath), '/'])
            const folderPath = isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath]) :  isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]): folderStructureWithRoot;
            const isExist = isPathExist(localPath);
            const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
            const fileDetails = {path, name: basename(localPath), relativeSrc, folderPath: folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
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
                // const localPath = lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                //     (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, path.replace(okmFolderStructure, '')]);
                // lwf for cup
                    // const localPath =  Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]) :  lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                    //    (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, path.replace(okmFolderStructure, '')]);
                    const localPath =  extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]);
                    
                    if (!isLwf) isLwf = lwfDetails.src ? true : false;
                // const folderPath = extendedJoin([dirname(localPath), '/']);
                // lwf for cup (without folder)
                // const folderPath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath])  :  isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]):  folderStructureWithRoot : extendedJoin([dirname(localPath), '/'])
                 const folderPath = isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath])  :  isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]):  folderStructureWithRoot;
                const isExist = isPathExist(localPath);
                const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                const fileDetails = { path,name: basename(localPath), relativeSrc, folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
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
            this.explorerPath = isLwf ? this.clientUtility.pathDetails.client.path : (folderStructure + this.filesInfo.folderName);
        } else {
            for (let i = 0; i < this.filesInfo.data.length; i++) {
                const { name: fileTypeName, basePath, typeId, files } = this.filesInfo.data[i];
                const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                const okmFolderStructure = basePath;
                for (let j = 0; j < files.length; j++) {
                    const file = files[j];
                    const { path, uuid, actfilemapid, isReadOnly, lwfDetails, overwrite,isFolder,folderRelativePath,folderName } = file;
                    // const localPath = lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                    //     (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, path.replace(okmFolderStructure, '')]);
                    // lwf changes for cup
                    // const localPath =  Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ?  extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]) 
                    // : lwfDetails.src ? (lwfDetails.isRoot ? (extendedJoin([folderStructureWithRoot, lwfDetails.src])) :
                    // (extendedJoin([folderStructure, lwfDetails.src]))) : extendedJoin([folderStructure, path.replace(okmFolderStructure, '')]);
                    const localPath =    extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]) ;
                    // const folderPath = extendedJoin([dirname(localPath), '/']);
                    // lwf changes for cup
                    // const folderPath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1'  ? isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]) :   folderStructureWithRoot : extendedJoin([dirname(localPath), '/'])
                    const folderPath = isFolder && folderName && folderRelativePath  ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path,'')]) :   folderStructureWithRoot;
                    const isExist =  isPathExist(localPath);
                    const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                    const fileDetails = { path,name: basename(localPath), relativeSrc, folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
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
        return new Promise(async (resolve, reject) => {
            try {
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
                    await Promise.all(awt);
                }
                if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloaded Files', progress: 80 }, 2);
                async function FileDownloadFun(file, _this) {
                    return new Promise(async (resolve, reject) => {
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
                resolve()
            } catch (error) {
                reject(error);
            }
        })
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
        return new Promise(async (resolve, reject) => {
            try {
                const { folderPath, name, uuid, path } = fileData;
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        await azureHelper.downloadFile(path, folderPath, name);
                        break;
                    case "local":
                        if(os.platform() == "win32" && isInternalConnection){
                            await localHelper.downloadLocalFileWithImpersonator(path, folderPath, name);
                        }
                        else{
                            await localHelper.downloadlocalFile(path, folderPath, name);
                        }
                        break;
                    default:
                        await okmHelper.downloadFile(uuid, folderPath, name);
                        break;
                }
                resolve()
            } catch (error) {
                reject(error);
            }
        })
    }
}

module.exports = {
    DownloadFiles 
};