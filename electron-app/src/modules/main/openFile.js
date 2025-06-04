const { isPathExist, retreiveLocalFiles, extendedJoin, getFormattedName, resolveToNormalPath, resolveToWinPath } = require('../utils/io');
const { getChecksum } = require('../utils/index');
const { dirname, basename, parse, extname, join } = require('path');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const softwareHelper = require('./../utils/software');
const { post } = require('../http/index');
const { copyIOFiles, copyIOFilesWithImpersonator, fetchFileCopyDetails } = require('./copyFiles');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { isRunning } = require('../utils/process');
const { userInfo } = require("os");
const micromatch = require('micromatch');
const localHelper = require('../utils/local');
const actions = { save: 'save', reject: 'reject', pending: 'pending', isCompulsoryCheck: 'isCompulsoryCheck' };


class OpenFiles {
    clientUtility = null;
    fileStatus = {
        download: [],
        downloaded: [],
        new: []
    };
    software = {
        detail: {},
        appId: null,
        path: null,
        config: {}
    }
    openSoftwareWithoutFiles = null;
    softwareSupportingFiles = [];
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
                await this.fetchDetails(payload);
                await this.clientUtility.updateStatusToServer({ message: 'Fetched File Details', progress: 35 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Analyzing Files', progress: 35 }, 2);
                if(this.clientUtility.activityDetails.iscamundaflow== true)
                     { 
                        await this.fetchFileStatus()
                } 
                else {
                    let localFile = await retreiveLocalFiles(join(this.clientUtility.pathDetails.client.path,'**', '*'))
                    let openFiles, newFileName;
                    let text = this.software.detail.apptypenew?this.software.detail.apptypenew:this.software.detail.apptype
                    if (text.length && Array.isArray(text)) {
                        let splitResult = text.filter(item =>{
                            let trimmedItem = item.trim(); 
                            return !trimmedItem.startsWith('.') && /\.[a-zA-Z0-9]+$/.test(trimmedItem);
                        } )  
                        if (splitResult.length) {
                            splitResult.forEach(filename => {
                                newFileName = getFormattedName(filename, this.clientUtility.activityDetails.placeHolders)
                                openFiles = localFile.filter((list) =>  list.includes(newFileName))
                            })
                        }else{
                            openFiles = this.filesInfo.extractedFiles.filter((list) => list.softwareOpen && this.software.detail.apptype.includes(extname(list.name)))
                        }
                    } else {
                             openFiles = this.filesInfo.extractedFiles.filter((list) => list.softwareOpen && this.software.detail.apptype.includes(extname(list.name)))
                    }
                      openFiles.forEach(list=>{
                        if(isPathExist(list.name?list.name:list)){
                            let file= {name: basename(list.name?list.name:list),folderPath:   join(dirname(list.name?list.name:list), '/'),isSoftwareOpen:true }
                            this.fileStatus.new.push(file)
                        }
                      })  
                     }
                await this.clientUtility.updateStatusToServer({ message: 'Analyzed Files', progress: 40 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Copying Supporting Files', progress: 40 }, 2);
                await this.SoftwareCloseValidation();
                await this.copySupportingFiles();
                await this.clientUtility.updateStatusToServer({ message: 'Copied Supporting Files', progress: 45 }, 2);
                global.log(this.fileStatus.download.map((file) => file.folderPath + file.name), 'Download files');
                global.log(this.fileStatus.downloaded.map((file) => file.folderPath + file.name), 'Downloaded files');
                global.log(this.fileStatus.new.map((file) => file.folderPath + file.name), 'New files');
                await this.clientUtility.updateStatusToServer({ message: 'Validating Files', progress: 45 }, 2);
                this.validateSupportedFile();
                await this.clientUtility.updateStatusToServer({ message: 'Validated Files', progress: 50 }, 2);
                await this.downloadFiles();
                await this.clientUtility.updateStatusToServer({ message: 'Opening Files', progress: 90 }, 2);
                await this.openFiles();
                this.clientUtility.updateFileDetails = true;
                resolve();
            } catch (err) {
                global.log(err, 'OpenFiles');
                reject(err);
            }
        });
    }

    async SoftwareCloseValidation() {
        if (this.software && this.software.detail && this.software.detail.appname) {
            switch (this.software.detail.appname.toLowerCase()) {
                case "3b2":
                    if (await isRunning("APP.exe")) {
                        throw new Error("Please close the Arbortext APP (3b2).");
                    }
                    break;
                default:
                    break;
            }
        }
    }

    async fetchDetails(payload) {
        this.fetchPayoadDetails(payload);
        await this.fetchFileDetails();
        await this.fetchSoftwareDetails();
    }

    fetchPayoadDetails(payload) {
        const { filesInfo } = payload;
        this.filesInfo.ext = filesInfo.ext;
        this.filesInfo.formattedExt = filesInfo.ext.split(';').map(ext => ext.trim()).filter(ext => ext);
        this.filesInfo.actFileMapId = filesInfo.actFileMapId;
        this.filesInfo.appId = filesInfo.appId;
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
            eventData: this.clientUtility.activityDetails.eventData,
            wfId: this.clientUtility.activityDetails.wfId,
            fileTypeId: this.clientUtility.activityDetails.fileType.id,
            wfDefId:this.clientUtility.activityDetails.wfDefId,
            activitymodeltypeflow:this.clientUtility.activityDetails.activitymodeltypeflow,
            issuemstid:this.clientUtility.activityDetails.issuemstid,
            isOtherArticle : this.clientUtility.activityDetails.isOtherArticle,
            articleOrderSequence : this.clientUtility.activityDetails.articleOrderSequence,
            iscamundaflow: this.clientUtility.activityDetails.iscamundaflow
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
        const softwareDetail = this.filesInfo.appId ? (this.clientUtility.activityDetails.software.find((tool) => tool.appid === this.filesInfo.appId)) :
            (this.clientUtility.activityDetails.software.find((tool) => tool.apptype.split(';').map(ext => ext.trim()).filter(ext => ext).includes(this.filesInfo.ext)));
        if (!softwareDetail) {
            throw 'Software is not mapped';
        } else {
            this.software.detail = softwareDetail;
            if (softwareDetail.isforcecopy) {
                this.software.path = softwareDetail.appurlpath;
                this.software.paths = [softwareDetail.appurlpath];
            } else {
                this.software.path = await this.getSoftwarePath(softwareDetail.appurlpath, this.filesInfo.ext);
                this.software.paths = await this.getSoftwarePaths(softwareDetail.appurlpath, this.filesInfo.ext);
            }
            this.software.appId = softwareDetail.appid;
            this.software.config = (this.clientUtility.activityDetails.softwareConfig['software'] && this.clientUtility.activityDetails.softwareConfig['software'][this.software.appId]) ? this.clientUtility.activityDetails.softwareConfig['software'][this.software.appId] : {};
            this.openSoftwareWithoutFiles = !!this.software.config.openSoftwareWithoutFiles;
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __SP__: extendedJoin([dirname(this.software.path)]) };
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __SPS__: this.software.paths.map(pth => extendedJoin([dirname(pth)])) };
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __SYSUser__: userInfo().username };
        }
    }

    validateSupportedFile() {
        if (!this.openSoftwareWithoutFiles) {
            const files = [...this.fileStatus.new, ...this.fileStatus.download, ...this.fileStatus.downloaded];
            if (!files.length) throw `File not found with extension ${this.filesInfo.ext}`;
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
            const { uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, path } = file;
            const localPath = extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]);
            const folderPath = extendedJoin([dirname(localPath), '/']);
            const isExist = isPathExist(localPath);
            const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
            const fileDetails = { path, name: basename(localPath), relativeSrc, folderPath: folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite };
            if (!isExist) {
                this.fileStatus.download.push(fileDetails);
            } else {
                if (overwrite) {
                    let srcChecksum = undefined;
                    let okmChecksum = undefined;
                    let awt = [];
                    awt.push(getChecksum(localPath).then(val => { srcChecksum = val; }).catch(err => { }));
                    switch (this.clientUtility.activityDetails.dmsType) {
                        case "azure":
                            awt.push(azureHelper.getChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
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
        } else {
            for (let i = 0; i < this.filesInfo.data.length; i++) {
                const { name: fileTypeName, basePath, typeId, files, pageRange } = this.filesInfo.data[i];
                const okmFolderStructure = basePath;
                const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                const excludedFiles = [];
                const filteredFiles = files.filter((file) => this.filesInfo.formattedExt.includes(file.ext));
                for (let j = 0; j < filteredFiles.length; j++) {
                    const file = filteredFiles[j];
                    const { path, uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isSoftwareOpen = false } = file;
                    const localPath = extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]);
                    const folderPath = extendedJoin([dirname(localPath), '/']);
                    const isExist = isPathExist(localPath);
                    const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
                    const fileDetails = { path, name: basename(localPath), relativeSrc, folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite, isSoftwareOpen };
                    excludedFiles.push(extendedJoin([fileDetails.folderPath, fileDetails.name], false));
                    if (isExist) {
                        // if (isReadOnly ) {
                        // let srcChecksum = undefined;
                        // let okmChecksum = undefined;
                        // let awt = [];
                        // awt.push(getChecksum(localPath).then(val => { srcChecksum = val; }).catch(err => { }));
                        // switch (this.clientUtility.activityDetails.dmsType) {
                        //     case "azure":
                        //         awt.push(azureHelper.getChecksum(path).then(val => { okmChecksum = val; }).catch(err => { }));
                        //         break;
                        //     default:
                        //         awt.push(localHelper.getlocalChecksum(uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                        //         break;
                        // }
                        // await Promise.all(awt);
                        // if (srcChecksum == okmChecksum) {
                        this.fileStatus.downloaded.push(fileDetails);
                        // } else {
                        // this.fileStatus.download.push(fileDetails);
                        // }
                        // } else if(!isReadOnly) {
                        //     this.fileStatus.downloaded.push(fileDetails);
                        // }
                    }
                }

                // Consider New files also
                this.filesInfo.data.forEach((data) => {
                    if (fileTypeName != data.name) excludedFiles.push(extendedJoin([this.clientUtility.pathDetails.client.path, data.name, '**', '*']));
                });
                const srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', `*.+(${this.filesInfo.formattedExt.map(ext => ext.substring(1)).join('|')})`]), excludedFiles);
                for (let j = 0; j < srcFiles.length; j++) {
                    const srcFile = extendedJoin([srcFiles[j]]);
                    // const isRootFile = !srcFile.includes(folderStructure);
                    // lwf changes for cup
                    //const isRootFile = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ? !srcFile.includes(folderStructureWithRoot) : !srcFile.includes(folderStructure);
                    const isRootFile = !srcFile.includes(folderStructureWithRoot);
                    const srcFileName = basename(srcFile);
                    const dirName = extendedJoin([dirname(srcFile), '/']);
                    // const intermediatePath = dirName.replace(isRootFile ? folderStructureWithRoot : folderStructure, '');
                    // lwf changes for cup
                    //const intermediatePath = Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ? dirName.replace(isRootFile ? folderStructureWithRoot : folderStructureWithRoot, '') : dirName.replace(isRootFile ? folderStructureWithRoot : folderStructure, '');
                    const intermediatePath = dirName.replace(isRootFile ? folderStructureWithRoot : folderStructureWithRoot, '');
                    const path = (intermediatePath ? extendedJoin([intermediatePath], false) : '') + srcFileName;
                    const fileValidationStatus = await this.isValidFile(basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                    if (fileValidationStatus.isValid && !fileValidationStatus.isAlreadyExist) {
                        this.fileStatus.new.push({ name: srcFileName, folderPath: dirName, isSoftwareOpen: true });
                    }
                }
            }
        }
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
            // const isMandatory = validationFile.mandatoryCheck ? (!!validationFile.mandatoryCheck[actions.save] || !!validationFile.mandatoryCheck[actions.reject] || !!validationFile.mandatoryCheck[actions.pending]) : false;
            // const isOptional = !!validationFile.mandatoryCheck && !isMandatory;
            const isSoftwareOpen = validationFile.softwareOpen ? true : false
            // lwf changes for cup
            // const lwfDetails = customer.id != '1' ?  validationFile.lwf && validationFile.lwf.src ? {
            //     src: validationFile.lwf.src, isRoot: !!validationFile.lwf.isRoot} : { src: '', isRoot: false } : { src: '', isRoot: false };
            const lwfDetails = { src: '', isRoot: false };
            if (!isSoftwareOpen) continue;
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


    async copySupportingFiles() {
        const supportingFiles = this.software.config.supportingFiles ? this.software.config.supportingFiles : []
        global.clientUtility = this.clientUtility
        const fileStatus = await fetchFileCopyDetails(supportingFiles, this.clientUtility, this.filesInfo.data);
        const os = require('os');
        if (os.platform() == "win32" && this.software && this.software.detail && this.software.detail.isAdminCopy) {
            await copyIOFilesWithImpersonator(fileStatus.files, true);
        }
        else {
            await copyIOFiles(fileStatus.files, true);
        }
    }

    async downloadFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                const progressDetails = {
                    currentProgress: 50,
                    fileProgress: 40 / this.fileStatus.download.length,
                    completedFileCount: 0,
                    totalFileCount: this.fileStatus.download.length
                }
                if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloading Files', progress: 50 }, 2);
                if (this.fileStatus.download.length) {
                    for (let i = 0; i < this.fileStatus.download.length; i++) {
                        const file = this.fileStatus.download[i];
                        await this.updateDownloadProgressDetails(file, progressDetails, true);
                        await this.downloadFile(file);
                        await this.updateDownloadProgressDetails(file, progressDetails, false);
                    }
                }
                if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloaded Files', progress: 90 }, 2);
                resolve();
            } catch (error) {
                reject(error);
            }
        })
    }

    downloadFile(fileData) {
        return new Promise(async (resolve, reject) => {
            try {
                const { folderPath, name, uuid, path } = fileData;
                const os = require('os');
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        await azureHelper.downloadFile(path, folderPath, name);
                        break;
                    case "local":
                        if (os.platform() == "win32") {
                            await localHelper.downloadLocalFileWithImpersonator(path, parse(folderPath).dir, basename(folderPath));
                        }
                        else {
                            await localHelper.downloadlocalFile(path, parse(folderPath).dir, basename(folderPath));
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

    async openFiles() {
        let isFileAvail = true
        if (this.openSoftwareWithoutFiles) {
            await this.openFileInSoftware("");
            isFileAvail=false
        } else if (this.clientUtility.activityDetails.config.softwareOpen) {
            let localBasePath = this.clientUtility.pathDetails.client.path + '/'
            if (this.fileStatus.download.length) {
                for (let i = 0; i < this.fileStatus.download.length; i++) {
                    if (localBasePath == resolveToNormalPath(this.fileStatus.download[i].folderPath))
                        if (this.fileStatus.download[i].isSoftwareOpen == true){
                            await this.openFile(this.fileStatus.download[i]);
                            isFileAvail=false
                        }
                }
            }
            if (this.fileStatus.downloaded.length) {
                for (let i = 0; i < this.fileStatus.downloaded.length; i++) {
                    if (localBasePath == resolveToNormalPath(this.fileStatus.downloaded[i].folderPath))
                        if (this.fileStatus.downloaded[i].isSoftwareOpen == true){
                            await this.openFile(this.fileStatus.downloaded[i]);
                            isFileAvail=false
                        }
                }
            }
            if (this.fileStatus.new.length) {
                for (let i = 0; i < this.fileStatus.new.length; i++) {
                    if (localBasePath == resolveToNormalPath(this.fileStatus.new[i].folderPath))
                        if (this.fileStatus.new[i].isSoftwareOpen == true){
                            await this.openFile(this.fileStatus.new[i]);
                            isFileAvail=false
                        }
                }
            }
        } else {
            const fileConfig = this.clientUtility.activityDetails.fileConfig;
            let localBasePath;
            if (fileConfig.softwareSrcInfo && !fileConfig.softwareSrcInfo.rootFlag) {
                const softwareSrcInfo = fileConfig.softwareSrcInfo;
                let subFolder = softwareSrcInfo.subPath ? getFormattedName(softwareSrcInfo.subPath, this.clientUtility.activityDetails.placeHolders) : '';
                localBasePath = softwareSrcInfo.subPath ? this.clientUtility.pathDetails.client.path + '/' + subFolder + '/' : '';

            }
            else
                localBasePath = this.clientUtility.pathDetails.client.path + '/';


            if (this.fileStatus.download.length) {
                for (let i = 0; i < this.fileStatus.download.length; i++) {
                    if (localBasePath == resolveToNormalPath(this.fileStatus.download[i].folderPath))
                        if (this.fileStatus.download[i].isSoftwareOpen == true){
                            await this.openFile(this.fileStatus.download[i]);
                            isFileAvail=false
                        }
                }
            }
            if (this.fileStatus.downloaded.length) {
                for (let i = 0; i < this.fileStatus.downloaded.length; i++) {
                    if (localBasePath == resolveToNormalPath(this.fileStatus.downloaded[i].folderPath))
                        if (this.fileStatus.downloaded[i].isSoftwareOpen == true){
                            await this.openFile(this.fileStatus.downloaded[i]);
                            isFileAvail=false
                        }
                }
            }
            if (this.fileStatus.new.length) {
                for (let i = 0; i < this.fileStatus.new.length; i++) {
                    if (localBasePath == resolveToNormalPath(this.fileStatus.new[i].folderPath))
                        if (this.fileStatus.new[i].isSoftwareOpen == true){
                            await this.openFile(this.fileStatus.new[i]);
                            isFileAvail=false
                        }
                }
            }
            if (this.clientUtility.activityDetails.BookDetails && this.clientUtility.activityDetails.BookDetails !== "") {
                if (this.clientUtility.activityDetails.fileType.id) {
                    let allConig = this.clientUtility.activityDetails.fileConfig.fileTypes[this.clientUtility.activityDetails.fileType.id].files
                    let BookDetailsConfig = allConig.find(x => x.name.includes('BookDetails'))
                    if (BookDetailsConfig.softwareOpen) {
                        let bookDetails = {}
                        bookDetails.folderPath = this.wf
                        bookDetails.name = this.clientUtility.activityDetails.BookDetails.fileName
                        await this.openFile(bookDetails);
                        isFileAvail=false
                    }
                }
            }
        }
        if(isFileAvail){
            throw(`File not found with extension ${this.filesInfo.ext}`)
        }
    }

    async openFile(fileData) {
        const { folderPath, name } = fileData;
        const filePath = extendedJoin([folderPath, name]);
        await this.openFileInSoftware(filePath)
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

    async openFileInSoftware(path) {
        let extName = extname(path);
        if (this.software.detail.apptype.includes(extName)) {
            softwareHelper.openFile(path, this.software.path);
        }
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
}

module.exports = {
    OpenFiles
};
