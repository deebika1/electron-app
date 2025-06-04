const { getChecksum } = require('../utils/index');
const { stat, retreiveLocalFiles, extendedJoin, readSmallFile, readDir, removeFile, readdirSync, getFileTypeFolderStructure, getFormattedName, isPathExist } = require('../utils/io');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { getRetreiveBlobFilesURL, httpDownload } = require("../utils/azure.js");
const { post,get } = require('../http/index');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { basename, dirname, join } = require('path');
const { glob } = require("glob");
const path = require('path');
const { preProcessing } = require('./preprocessing');
const { getToolDetails,onServiceTools, onSaveValidationForTools, onSaveValidationForServiceTools, graphiconsave, checkGraphicEnabled,uploadxltoFTP,isWordCount,onSaveXmlValidation,onSaveMailTrigger,uploadziptoSFTP,GetAllFiles } = require('./postProcessing/onSaveValidation')
const { closeExplorer } = require('../utils/explorer');
const { ShareFilesync } = require('./syncToolsFile')
const { retreiveOKMFiles } = require('./preprocessing')
const { extractZip } = require('./postProcessing/tools');
const { readFileSync, promises } = require('fs');
const pLimit = require('p-limit');
const limit = pLimit(10);
const micromatch = require('micromatch');
const { Logger } = require('log4js');
const { DeleteFilesPowerShellCommand } = require('../utils/CopyFilesPowerShellCommand.js');
const { exists } = require('fs-extra');
const { promisifiedRequest } = require("./copyFiles.js");
const { forEach } = require('jszip');
const os = require('os');
const actions = { save: 'save', reject: 'reject', pending: 'pending', isCompulsoryCheck: 'isCompulsoryCheck' };
class Reject {
    fileStatus = {
        new: [],
        update: [],
        noChange: [],
        inValid: [],
        requiredFiles: [],
        tool: [],
        missedFile: [],
        missedFileType: [],
        mandatoryInFiles:[],
    };
    action = null;
    isFileSynced = false;
    fileTypes = [];
    filesInfo = {
        data: [],
        requiredFiles: [],
        missedFileTypeInfo: [],
        issueWoInfo: [],
        srcFiles: [],
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
                if(this.clientUtility.activityDetails.iscamundaflow){
                    // with camunda here
               
                }else{
                    let  unOptionalFiles =  this.filesInfo?.extractedFiles.filter((list) => !list.isOptional) || [];
                    if(unOptionalFiles && unOptionalFiles.length > 0){
                    let folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                    let srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), []);
                    if(this.clientUtility.activityDetails.wfId != 43){
                        await this.validateFilePaths(srcFiles);
                    }
                    srcFiles.map(tempfile => {
                        let index = unOptionalFiles.findIndex((file) => file.name.replace(/\\/ig, '/') == tempfile.replace(/\\/ig, '/') || (file.isFile == false && tempfile.replace(/\\/ig, '/').includes(file.name.replace(/\\/ig, '/'))));
                        if (index !== -1) unOptionalFiles.splice(index, 1);
                    });
                    this.fileStatus.mandatoryInFiles = unOptionalFiles;
                    // await this.mandatoryOutFileCheck(unOptionalFiles);
                    await this.validateOut();
                }
                //   if(unOptionalFiles && unOptionalFiles.length > 0){
                //     await this.mandatoryOutFileCheck(unOptionalFiles);
                //     await this.validateOut();
                //   };
                     await this.constructOutPayload();
                //     this.validateZeroFileSize();
                }
                await this.clientUtility.updateStatusToServer({ message: 'Analyzed Files', progress: 40 }, 2);
                this.fileStatus.new = [...(this.clientUtility.extraUploadfile || []), ...this.fileStatus.new];
                global.log(this.fileStatus.new.map((file) => file.src), 'New files');
                global.log(this.fileStatus.update.map((file) => file.src), 'Update files');
                global.log(this.fileStatus.noChange.map((file) => file.src), 'No Change files');
                global.log(this.fileStatus.inValid.map((file) => file.src), 'InValid files');
                global.log(this.fileStatus.requiredFiles.map((file) => file.name), 'Missed files');
                console.log("this.clientUtility",this.clientUtility);
                  
                
                await this.clientUtility.updateStatusToServer({ message: 'Validating Files', progress: 40 }, 2);
            

                await this.captureActionEntry({
                    actionType: this.action, wfeventId: this.clientUtility.activityDetails.wfEventId,
                    userId: payload.userid
                });
                await this.clientUtility.updateStatusToServer({ message: 'Validated Files', progress: 50 }, 2);
           
               
                //await this.clientUtility.logLocalWorkingFolder("Sync File");
                try {
                    await this.CheckisDirectoryBusy(this.clientUtility.pathDetails.client.path);
                    await this.uploadFiles();
                } catch (err) {
                    if (this.clientUtility.activityDetails.dmsType == 'local' && err && err.message && err.message.code === 'EBUSY') {
                        throw ` Please close the ${basename(err.message.path)} opened in the Server location`
                    } else {
                        reject(err)
                    }
                }
                if (this.clientUtility.activityDetails.config && Object.keys(this.clientUtility.activityDetails.config).length > 0 && Object.keys(this.clientUtility.activityDetails.config).includes('syncLocalDelete') && this.clientUtility.activityDetails.config.syncLocalDelete) {
                    await this.lockFileSyncStatus();

                }
                this.clientUtility.updateFileDetails = true

                await this.clientUtility.updateStatusToServer({ message: 'success' }, 1);
                resolve();
            } catch (err) {
                global.log(err, "Sync");
                if (typeof err === "string") {
                    reject({
                        message: err,
                    });
                } else {
                    reject(err);
                }
            }
        });
    }


    async CheckisDirectoryBusy(path) {
        return new Promise(async (resolve, reject) => {
            try {
                var currentPath;
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
                    reject(`Please close the busy directory (${relativeSrc}).`);
                } else {
                    reject(e);
                }
            }
            resolve();
            //     var getAllFiles = await glob.Glob("*.*", {
            //         nodir: true,
            //         nocase: false,
            //         cwd: path,
            //         absolute: true,
            //         matchBase: true
            //     });
            //     let BusyFiles = [];
            //     for (let index = 0; index < getAllFiles.length; index++) {
            //         const filePath = getAllFiles[index];
            //         try {
            //             const fileHandle = await fs.promises.open(filePath, fs.constants.O_RDONLY | 0x10000000);
            //             fileHandle.close();
            //         } catch (error) {
            //             if (error.code === 'EBUSY') {
            //                 BusyFiles.push(basename(filePath));
            //             }
            //         }
            //     }
            //     if (BusyFiles.length > 0) {
            //         reject(`Close the below opened files. \n ${BusyFiles.join('\n')}`);
            //     } else {
            //         resolve();
            //     }
        });
    }

    async validateFileContentOnsave(folderPath, item) {
        try {
            return new Promise(async (resolve, reject) => {
                let TotalPagNum;
                readdirSync(folderPath).forEach(async (File) => {
                    if (File.includes(".pginfo") || File.includes(".PgInfo")) {
                        const fileContent = readFileSync(path.join(folderPath, File), { encoding: 'utf8' });
                        console.log(fileContent, "fileContents");
                        let regex = /(?<=<TotalPage>).*?(?=<\/TotalPage>)/gm;
                        console.log(regex, "regex");
                        let m;
                        while ((m = regex.exec(fileContent)) !== null) {
                            if (m.index === regex.lastIndex) {
                                regex.lastIndex++;
                            }
                            m.forEach((match, groupIndex) => {
                                console.log(`Found match, group ${groupIndex}: ${match}`);
                                TotalPagNum = match
                            });
                        }
                    }
                });
                // save the total page number in the database
                if (Number(TotalPagNum) > 0) {
                    console.log("matchPageCount", TotalPagNum);
                    let payload = {
                        "isTypeset": true,
                        "workorderId": Number(this.clientUtility.activityDetails.workOrderId),
                        "stageId": Number(this.clientUtility.activityDetails.stage.id),
                        "iterationCount": Number(this.clientUtility.activityDetails.stage.iteration),
                        "count": Number(TotalPagNum),
                        "woIncomingFileId": this.clientUtility.activityDetails.woIncomingFileId
                    }
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.updateTotalPgFromPgInfo}`, payload, headers);
                    resolve(true);
                } else {
                    resolve(false);
                };
                resolve(true);
            })
        } catch (err) {
            reject(err)
        }
    }

    async validateFilePaths(folderPath) {
        return new Promise(async (resolve, reject) => {
              try {  
                   let invalidFiles = 0;
                  folderPath.forEach(async FileName => {
                      console.log(FileName)
                      const FileNameRegexPattern = /^[A-Za-z0-9~!@$*()-_=|;:'",.<>/? ]+$/
                      var regexFormat = new RegExp(FileNameRegexPattern, "g")
                      if (FileName.includes('[') || FileName.includes(']') || FileName.includes('^') || FileName.includes('+'))
                      {  
                          invalidFiles++
                          console.log(`String ${FileName}:  matches the pattern.`); 
                          reject('The filename contains other languages or junk characters.'+ FileName);
                          throw 'The filename contains other languages or junk characters.' + FileName;
                      } 
                      else if (regexFormat.test(FileName)){ 
                      }
                      else
                      {  
                          invalidFiles++
                          console.log(`String ${FileName}:  matches the pattern.`); 
                          reject('The filename contains other languages or junk characters.'+ FileName);
                          throw 'The filename contains other languages or junk characters.' + FileName;
                      } 
                  }) 
                  if(invalidFiles == 0){
                      resolve(true)
                  } 
              } catch (err) {
                  reject('The filename contains other languages or junk characters.')
                  throw 'The filename contains other languages or junk characters.' + FileName;
              }

            });
      }
    async clearLogThenValdiate(folderPath, fileExtn) {
        readdirSync(folderPath).forEach(async File => {
            if (File.includes(fileExtn)) {
                removeFile(path.join(folderPath, File)); //Delete not required confirmed by T&E
            }
            if (File.includes('.zip')) {
                global.log(File, "zip file to extract")
                extractZip(path.join(this.wf, File), undefined).catch(async (err) => {
                    await this.clientUtility.updateStatusToServer({ message: 'Analyzing Files', progress: 0 }, 2);
                    global.log(err, "Unable to extract the zip")
                });
            }
        });
    }

    async fetchDetails(payload) {
        this.fetchPayoadDetails(payload);
        await this.fetchFileDetails();
    }

    fetchPayoadDetails(payload) {
        const { action } = payload;
        this.action = action;
        this.wf = extendedJoin([this.clientUtility.pathDetails.client.path], false);
        let DOI =  this.clientUtility.activityDetails.placeHolders.DOI ?  this.clientUtility.activityDetails.placeHolders.DOI:''
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]), __DOI__ : DOI? DOI.replaceAll('/','_'): ''};
        // this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]) };
    }

    preProcessing(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await preProcessing(this.filesInfo, this.clientUtility, this.action, 'sync');
                await this.fetchDetails(payload);
                resolve();
            } catch (err) {
                reject(err)
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
            mandatorySaveFile: this.clientUtility.activityDetails.mandatorySaveFile,
            eventData: this.clientUtility.activityDetails.eventData,
            fileTypeId: this.clientUtility.activityDetails.fileType.id,
            wfDefId: this.clientUtility.activityDetails.wfDefId,
            activitymodeltypeflow: this.clientUtility.activityDetails.activitymodeltypeflow,
            issuemstid: this.clientUtility.activityDetails.issuemstid,
            isOtherArticle: this.clientUtility.activityDetails.isOtherArticle,
            articleOrderSequence: this.clientUtility.activityDetails.articleOrderSequence,
            iscamundaflow: this.clientUtility.activityDetails.iscamundaflow,
            isReject: true



        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, filesAdditionalInfo, validationFileConfig, fileTypes } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.fileTypes = fileTypes;
        if (this.clientUtility.activityDetails.wfId == 28) {
            const uniqueData = filesAdditionalInfo.requiredFiles.reduce((acc, obj) => {
                const existingObject = acc.find(item => item.name === obj.name);
                if (!existingObject) {
                    acc.push(obj);
                }
                return acc;
            }, []);
            this.filesInfo.requiredFiles = uniqueData
        } else {
            this.filesInfo.requiredFiles = filesAdditionalInfo.requiredFiles;

        }

        this.filesInfo.missedFileTypeInfo = filesAdditionalInfo.missedFileTypeInfo;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;

        if(filesAdditionalInfo?.extractedFiles.length > 0){
            let  updatedPayload =await this.updateCopyPaths(filesAdditionalInfo?.extractedFiles);
            this.filesInfo.extractedFiles  = updatedPayload
            // this.filesInfo.extractedFiles  =filesAdditionalInfo?.extractedFiles
        }

    }

    async getIssueWorkorderInfo() {
        return new Promise(async (resolve, reject) => {
            try {
                const filePayload = {
                    wfDefId: this.clientUtility.activityDetails.wfDefId,
                    issuemstid: this.clientUtility.activityDetails.issuemstid
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const { issueWoInfo } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getIssueWorkorderInfo}`, filePayload, headers);
                this.filesInfo.issueWoInfo = issueWoInfo;
                resolve(true)

            } catch (error) {
                reject(error)
            }
        })
    }

    _isValidFile = async (payload) => {
        let { validationFiles, file, files, placeHolders, customer } = payload;
        const response = { isValid: false, isAlreadyExist: false, name: '', existedFileInfo: { name: '', uuid: '' }, lwfDetails: { name: '', src: '' } };
        let isbreak = false
        for (let i = 0; i < validationFiles.length; i++) {
            const validationFile = validationFiles[i];
            const isMandatory = validationFile.mandatoryCheck ? (!!validationFile.mandatoryCheck[actions.save] || !!validationFile.mandatoryCheck[actions.reject] || !!validationFile.mandatoryCheck[actions.pending]) : false;
            const isOptional = !!validationFile.mandatoryCheck && !isMandatory;
            // lwf changes for cup
            // const lwfDetails = customer.id != '1' ?  validationFile.lwf && validationFile.lwf.src ? {
            //     src: validationFile.lwf.src, isRoot: !!validationFile.lwf.isRoot} : { src: '', isRoot: false } : { src: '', isRoot: false };

            const lwfDetails = { src: '', isRoot: false };
            if (!isMandatory && !isOptional) continue;
            let springerZipFileName = files.length > 0 ? files[0].newfilename : ""

            placeHolders.articletype = ((placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == placeHolders.FileTypeName).pop() || {}).articletype;
            let name = validationFile.name ? (validationFile.name[0] == '/' ? validationFile.name.substring(1) : validationFile.name) : '*';
            let JnlTypeFileTypeName = placeHolders.FileTypeName + placeHolders.JnlTypeFileName
            let FileTypeName = placeHolders.FileTypeName ? placeHolders.FileTypeName : ''
            let piivalue = ((placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == placeHolders.FileTypeName).pop() || {}).piinumber;
            // let piivalue = await this.getFileNameForPii({ workOrderId: this.clientUtility.activityDetails.workOrderId, fileName :FileTypeName  })
            piivalue = piivalue != '' ? piivalue : ''
            placeHolders = { ...placeHolders, JnlTypeFileTypeName: JnlTypeFileTypeName, IssuePII: piivalue, zipFileName: springerZipFileName }

            let formattedName = validationFile.name ? getFormattedName(name, placeHolders) : '';
            let formattedLWFSrcName = lwfDetails.src ? getFormattedName(lwfDetails.src, placeHolders) : '';
            const { path, basePath, isRoot = false } = file;
            let pattern = lwfDetails.src ? formattedLWFSrcName : formattedName;
            pattern = pattern ? (pattern[0] == '/' ? pattern.substring(1) : pattern) : '*'
            if (!isbreak) {
                console.log(!pattern.includes('{{'), '{{{ppp}}}')
                console.log(micromatch.isMatch(path, pattern), 'ppp');
                console.log(isRoot == lwfDetails.isRoot, 'isroot');
                response.isValid = isRoot == lwfDetails.isRoot && micromatch.isMatch(path, pattern) && !pattern.includes('{{');
                response._tempisValid = response.isValid;
            } else {
                response._tempisValid = false;
            }
            if (response._tempisValid) {
                if (response._lwfDetails == undefined) response._lwfDetails = [];
                response._lwfDetails.push({ name: formattedName, src: formattedLWFSrcName });
                if (!isbreak) {
                    response.lwfDetails = { name: formattedName, src: formattedLWFSrcName };
                    response.name = formattedName;
                    let _path = lwfDetails.src ? formattedName : file.path;
                    const matchedFile = files.find(fileData => fileData.path == basePath + _path);
                    response.isAlreadyExist = matchedFile ? true : false;
                    if (response.isAlreadyExist) {
                        response.existedFileInfo.name = matchedFile.path;
                        response.existedFileInfo.uuid = matchedFile.uuid;
                    }
                }
                isbreak = true
            }
        }
        return response;
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
    async isValidFile(basePath, path, isRoot, typeId, typeName, files, pageRange) {
        return new Promise(async (resolve, reject) => {
            try {
                if (this.clientUtility.activityDetails.validationFileConfig[typeId]) {
                    const payload = {
                        validationFiles: this.clientUtility.activityDetails.validationFileConfig[typeId].files || [],
                        file: { path, basePath, isRoot },
                        files: files.map((file) => { return { path: file.path, uuid: file.uuid, newfilename: file.newfilename } }),
                        placeHolders: { ...this.clientUtility.activityDetails.placeHolders, ... { FileTypeName: typeName, PageRange: pageRange } },
                        customer: this.clientUtility.activityDetails.customer
                    };

                    // const headers = {
                    //     'Authorization': `Bearer ${config.server.getToken()}`
                    // };
                    //const isValidFile = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.isValidFile}`, payload, headers);
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

    async validate() {
        if (global.isContentValidationStatus) throw 'Package Content Validatation Failed.'
        this.validateMissingFiles();
        await this.validateZeroFileSize();
        // await this.validateProcess();
    }

    async validateProcess() {
        // need to implement
    }

    async captureActionEntry(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.captureUserEvent}`, payload, headers);
                resolve(true);
            }
            catch (e) {
                global.log(e, 'User action entry error');
                reject(e);
            }
        });
    }


    async validateZeroFileSize() {
        const files = [...this.fileStatus.new, ...this.fileStatus.update];
        let checkZeroSize = (file) => {
            return new Promise(async resolve => {
                const { src } = file;
                const fStat = await stat(src);
                resolve(fStat.size == 0);
            })
        }
        let awt = [];
        files.forEach(ele => {
            awt.push(checkZeroSize(ele))
        })
        let out = await Promise.all(awt);
        if (out.filter(x => x == true).length) {
            throw 'Zero kb file found. Please upload valid file';
        }
    }


    async uploadFiles() {
        return new Promise(async (resolve, reject) => {
            try {
           
                const progressDetails = {
                    currentProgress: 50,
                    fileProgress: 40 / this.fileStatus.new.length + this.fileStatus.update.length,
                    completedFileCount: 0,
                    totalFileCount: this.fileStatus.new.length + this.fileStatus.update.length
                }
                if (this.fileStatus.new.length || this.fileStatus.update.length) await this.clientUtility.updateStatusToServer({ message: 'Uploading Files', progress: 50 }, 2);
                if (this.fileStatus.new.length) {
                    let awt = [];
                    for (let i = 0; i < this.fileStatus.new.length; i++) {
                        awt.push(limit(() => uploadNewFiles(i, this)));
                    }
                    await Promise.all(awt);
                }
                if (this.fileStatus.update.length) {
                    let awt = [];
                    for (let i = 0; i < this.fileStatus.update.length; i++) {
                        awt.push(limit(() => uploadUpdateFiles(i, this)));
                        //await uploadUpdateFiles(i, this)
                    }
                    await Promise.all(awt);
                }
                if (this.fileStatus.new.length || this.fileStatus.update.length) await this.clientUtility.updateStatusToServer({ message: 'Uploaded Files', progress: 90 }, 2);
                if (this.fileStatus.noChange.length) await this.clientUtility.updateStatusToServer({ message: 'Updating unchanged files', progress: 90 }, 2);
                if (this.fileStatus.noChange.length) {
                    let awt = [];
                    for (let i = 0; i < this.fileStatus.noChange.length; i++) {
                        awt.push(limit(() => this.updateNoChangeFile(this.fileStatus.noChange[i])));
                    }
                    await Promise.all(awt);
                }
                if (this.fileStatus.noChange.length) await this.clientUtility.updateStatusToServer({ message: 'Updated unchanged files', progress: 95 }, 2);

                function uploadUpdateFiles(i, _this) {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const file = _this.fileStatus.update[i];
                            await _this.updateUploadProgressDetails(file, progressDetails, true);
                            await _this.uploadExistingFile(file);
                            await _this.updateUploadProgressDetails(file, progressDetails, false);
                            resolve();
                        } catch (err) {
                            global.log("Upload updated file : ", err);
                            reject(err);
                        }
                    });
                }

                async function uploadNewFiles(i, _this) {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const file = _this.fileStatus.new[i];
                            await _this.updateUploadProgressDetails(file, progressDetails, true);
                            await _this.uploadNewFile(file);
                            await _this.updateUploadProgressDetails(file, progressDetails, false);
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                }
                await this.updateFileSyncStatus();
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

    async uploadExistingFile(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const { src, destUUID, actFileMapId, path } = file;
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        await azureHelper.uploadExistingFile(src, path);
                        break;
                    case "local":
                        // if(os.platform() == "win32" && isInternalConnection){
                        //     await localHelper.uploadlocalExistingFileWithImpersonator(src, path);
                        // }
                        // else{
                        await localHelper.uploadlocalExistingFile(src, path);
                        // }
                        break;
                    default:
                        await okmHelper.uploadExistingFile(src, destUUID);
                        break;
                }
                await this.updateExistingFileDetails(actFileMapId);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async uploadNewFile(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const { src, srcName, dest, fileId, wfeventid } = file;
                const okmDest = dest.replace(new RegExp(/\\/, 'g'), '/');
                const fileName = basename(srcName);
                let out = {};
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        out = await azureHelper.uploadNewFile(src, okmDest, srcName);
                        break;
                    case "local":
                        // Incoming save fix given by Devan 05-Mar-24
                        // if(os.platform() == "win32" && isInternalConnection){
                        // out = await localHelper.uploadlocalNewFileWithImpersonator(src, okmDest, srcName);
                        // }
                        // else {
                        out = await localHelper.uploadlocalNewFile(src, okmDest, srcName);
                        // }
                        break;
                    default:
                        await okmHelper.deleteFile(okmDest + fileName);
                        out = await okmHelper.uploadNewFile(src, okmDest, srcName);
                        break;
                }
                const { uuid, path } = out;
                if (!file.skipTRNEntry && this.clientUtility.activityDetails.iscamundaflow) {
                    await this.updateNewFileDetails(uuid, path, fileId, wfeventid);
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async updateNewFileDetails(uuid, path, fileId, wfeventid) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!path.includes('tool')) {
                    let fileTrnData = {
                        type: 'insert_new_file',
                        payload: {
                            wfEventId: wfeventid, uuid, path, fileId
                        }
                    };
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateFileTRNLog}`, fileTrnData, headers);
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async updateExistingFileDetails(actFileMapId) {
        return new Promise(async (resolve, reject) => {
            try {
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
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async updateFileSyncStatus() {
        return new Promise(async (resolve, reject) => {
            try {
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
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async lockFileSyncStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.isFileSynced) {
                    var LocalFileNames = await this.readLocalFiles();
                    const payload = {
                        wfEventId: this.clientUtility.activityDetails.wfEventId,
                        LocalFileNames: LocalFileNames,
                    };
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.lockFileSyncStatus}`, payload, headers);
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async readLocalFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                var localFileName = []
                var localFileNameDetails = []
                var clientPath = this.clientUtility.pathDetails.client.path;
                if (isPathExist(clientPath)) {
                    localFileName = await GetAllFiles(clientPath)
                }
                if (Array.isArray(localFileName)) {
                    localFileName.forEach((list) => {
                        const relativeSrc = extendedJoin([list], false).replace(this.clientUtility.pathDetails.client.path, '');
                        localFileNameDetails.push(relativeSrc)
                    })
                }
                resolve(localFileNameDetails)
            }
            catch (e) {
                global.log(e, "read all local file to lock");
                reject(e)
            }
        })
    };
    async mandatoryOutFileCheck(unOptionalFiles){
        return new Promise(async (resolve, reject) => {
           try {         
               let mandatorypayload = {
                   dmsType : this.clientUtility.activityDetails.dmsType,
                   data : unOptionalFiles
               }
              const response = await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.Downloadmandatorycheck}`,mandatorypayload, {});
            this.fileStatus.mandatoryInFiles =  response.filter((list) => !list.isexists) || [];      
               resolve(true);
           } catch (e) {
               global.log(e, 'getRetreiveBlobFilesURL error');
               reject(e);
           }
       });

   };;
   async validateOut() {
    this.validateOutFiles();
    // await this.validateProcess();
}

validateOutFiles() {
    if (this.fileStatus.mandatoryInFiles.length) {
        const missingFilesMessage = this.fileStatus.mandatoryInFiles.map(file => {
            // Simply return the file name
            return basename(file.name) || 'Unknown Name';
        }).join(', ');

        throw `Following mandatory files are missing :\n ${missingFilesMessage}`;
    }
};


async constructOutPayload(){
    let folderFiles =  this.filesInfo?.extractedFiles.filter((list) => !list.isFile) || [];
    let files =  this.filesInfo?.extractedFiles.filter((list) => list.isFile) || [];
 
    let filesUploadList = [];

    // Handle files upload list
    if (files && files.length > 0) {
        let folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
        let srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), []);
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            for (let j = 0; j < file.copyPaths.length; j++) {
                let copyInfo = file.copyPaths[j];
                let fileExists = false;
    
                switch (this.clientUtility.activityDetails.dmsType) {
                    case 'azure':
                        let isFileExists = await azureHelper.isFileExist(copyInfo.sourcepath);
                        if (isFileExists && isFileExists.isFileExist) {
                            fileExists = true;
                        }
                        break;
    
                    case 'local':
                        if (file.isOptional) {
                            srcFiles.map(tempfile => {
                                if(tempfile.replace(/\\/ig, '/') == copyInfo.sourcepath.replace(/\\/ig, '/')){
                                    fileExists = true
                                }
                            });
                        } else {
                            fileExists = true;
                        }
                        break;
    
                    default:
                        break;
                }
    
                if (fileExists) {
                    let directory = path.dirname(copyInfo.destpath);
                    filesUploadList.push({
                        src: copyInfo.sourcepath,
                        uuid: this.clientUtility.activityDetails.dmsType,
                        dest: directory.endsWith('\\') || directory.endsWith('/')  ? directory : directory + '\\',
                        srcName: basename(copyInfo.destpath)
                    });
                }
            }
        }
    }
    
    // Handle folder files download list
    if (folderFiles && folderFiles.length > 0) {
        for (let i = 0; i < folderFiles.length; i++) {
            let file = folderFiles[i];

            for (let j = 0; j < file.copyPaths.length; j++) {
                let copyInfo = file.copyPaths[j];
                let files = [];

                switch (this.clientUtility.activityDetails.dmsType) {
                    case 'azure':
                        files = await getRetreiveBlobFilesURL(copyInfo.sourcepath);
                        break;
                    case 'local':
                        files = await retreiveLocalFiles(extendedJoin([copyInfo.sourcepath, '**', '*']), [])
                        break;
                    default:
                        break;
                }

                if (files && files.length > 0) {
                    files.forEach((list) => {
                        let directory = copyInfo.destpath;
                        filesUploadList.push({
                            src: list.replace(/\//ig, '\\'),
                            uuid: this.clientUtility.activityDetails.dmsType,
                            dest: directory.endsWith('\\') || directory.endsWith('/') ? directory : directory + '\\',
                            srcName: basename(list)
                        });
                    });
                }
            }
        }
    }
    
    this.fileStatus.new = filesUploadList;
    
   };

  async updateCopyPaths(payloads) {
    return payloads.map(payload => ({
      ...payload,
      copyPaths: payload.copyPaths.map(path => ({
        sourcepath: path.sourcepath.replace(/\//g, '\\'),
        destpath: path.destpath.replace(/\//g, '\\')
      }))
    }));
  }
}

module.exports = {
    Reject
};
