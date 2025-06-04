const { getChecksum } = require('../utils/index');
const { stat, retreiveLocalFiles, extendedJoin, readSmallFile, readDir, removeFile, readdirSync, getFileTypeFolderStructure, getFormattedName, isPathExist, isDirExist } = require('../utils/io');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { getRetreiveBlobFilesURL, httpDownload } = require("../utils/azure.js");
const { post, get } = require('../http/index');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { basename, dirname, join } = require('path');
const { glob } = require("glob");
const path = require('path');
const { preProcessing } = require('./preprocessing');
const { getToolDetails, onServiceTools, onSaveValidationForTools, onSaveValidationForServiceTools, graphiconsave, checkGraphicEnabled, uploadxltoFTP, isWordCount, onSaveXmlValidation,ishtmValdReq, onSaveMailTrigger, uploadziptoSFTP, GetAllFiles, isWordCountFromTxt, isTypesetPgeFromPageInfo, pageCountFromPDF,isTypesetPgeFromWord, isIncomingFromPdf, isIncomingFromWord, imageUpload, isIncomingFromPageInfo,isWordCountForFile,readXmlExport } = require('./postProcessing/onSaveValidation')
const { closeExplorer } = require('../utils/explorer');
const { ShareFilesync } = require('../main/syncToolsFile')
const { retreiveOKMFiles } = require('../main/preprocessing')
const { extractZip, createZipAndDeleteSourceFiles } = require('./postProcessing/tools');
const { readFileSync, existsSync, statSync, promises } = require('fs');
const pLimit = require('p-limit');
const limit = pLimit(10);
const micromatch = require('micromatch');
const { Logger } = require('log4js');
const { DeleteFilesPowerShellCommand } = require('../../modules/utils/CopyFilesPowerShellCommand.js');
const { exists } = require('fs-extra');
const fs = require('fs-extra');
const { promisifiedRequest } = require("../../modules/main/copyFiles.js");
const { forEach } = require('jszip');
const os = require('os');
const actions = { save: 'save', reject: 'reject', pending: 'pending', isCompulsoryCheck: 'isCompulsoryCheck' };
class Sync {
    fileStatus = {
        new: [],
        update: [],
        noChange: [],
        inValid: [],
        requiredFiles: [],
        tool: [],
        missedFile: [],
        missedFileType: [],
        mandatoryInFiles: [],
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
        insertTrnFiles:[],
        updateTrnFiles:[]
    };

    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }

    startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                global.log(`Save process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                await this.clientUtility.updateStatusToServer({ message: 'Fetching File Details', progress: 30 }, 2);
                await this.fetchDetails(payload);
                let files = [];
                if (this.clientUtility.activityDetails.iscamundaflow) {
                    let folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                    let srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), []);
                    await this.validateFilePaths(srcFiles);

                    this.filesInfo.data.forEach(element => {
                        if (this.clientUtility.activityDetails.validationFileConfig[element.typeId])
                            files.push(this.clientUtility.activityDetails.validationFileConfig[element.typeId].files)
                    });
                    global.clientUtility = this.clientUtility;
                    //let files = this.clientUtility.activityDetails.validationFileConfig[element.typeId].files
                    let unzipValidationRequired = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "unzipvalidationrequired").length > 0);
                    if (unzipValidationRequired.length > 0) {
                        global.successPatternCV = `<b style="color:green"> SUCCESS</b>`;
                        global.failurePatternCV = `<b>Status:</b><b style="color:red"> FAILURE [ Total Errors - 3 ]</b>`;
                        await this.clearLogThenValdiate(this.wf, '.xhtml')
                    }
                } else {
                    files.push(this.filesInfo.extractedFiles)
                }
                await this.clientUtility.updateStatusToServer({ message: 'Fetched File Details', progress: 35 }, 2);
                await this.clientUtility.updateStatusToServer({ message: 'Analyzing Files', progress: 35 }, 2);
                await this.preProcessing(payload)

                if (this.clientUtility.activityDetails.iscamundaflow) {
                    await this.fetchFileStatus();
                    if (Object.keys(this.clientUtility.activityDetails.config).includes('globalFileSave') && this.clientUtility.activityDetails.config.globalFileSave) {
                        let allFiles = []
                        let copy = this.fileStatus.new.length > 0 ? [...this.fileStatus.new] : [...this.fileStatus.noChange]
                        copy = copy.splice(0, 1)
                        const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                        const excludedFiles = [];
                        const retreivedFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), excludedFiles);
                        for (var i = 0; i < retreivedFiles.length; i++) {
                            let obj = { ...copy[0] }
                            let paths = retreivedFiles[i]
                            let file = basename(paths);
                            obj.srcName = file
                            obj.relativeSrc = '/' + file
                            obj.src = paths
                            allFiles.push(obj)

                        }
                        this.fileStatus.new = allFiles
                    };
                } else {
                    let unOptionalFiles = [];
                    if (this.action == 'save' || this.action == 'pending') {
                        await this.customSkipValidateFiles(this.action);
                    }
                    if (this.action == 'pending') {
                        unOptionalFiles = this.filesInfo?.extractedFiles.filter((list) => list.mandatoryCheck.pending) || [];
                    }
                    else {
                        unOptionalFiles = this.filesInfo?.extractedFiles.filter((list) => list.mandatoryCheck.save ) || [];
                    }
                    if (unOptionalFiles && unOptionalFiles.length > 0) {
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
                        
                        //Skipping the mandatory file validation during Rejection
                        if(this.action !='reject'){
                            await this.validateOut();
                        }
                    };
                    await this.constructOutPayload(this.action);
                    this.validateZeroFileSize();
                }
                await this.clientUtility.updateStatusToServer({ message: 'Analyzed Files', progress: 40 }, 2);
                this.fileStatus.new = [...(this.clientUtility.extraUploadfile || []), ...this.fileStatus.new];
                global.log(this.fileStatus.new.map((file) => file.src), 'New files');
                global.log(this.fileStatus.update.map((file) => file.src), 'Update files');
                global.log(this.fileStatus.noChange.map((file) => file.src), 'No Change files');
                global.log(this.fileStatus.inValid.map((file) => file.src), 'InValid files');
                global.log(this.fileStatus.requiredFiles.map((file) => file.name), 'Missed files');
                console.log("this.clientUtility", this.clientUtility);
                if (this.clientUtility.activityDetails.newsletter == true) {

                    let skipFiles = files.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "optional").length > 0);
                    skipFiles.forEach((list) => {
                        list.name = list.name
                            .replace(';FileTypeName;', this.clientUtility.activityDetails.placeHolders.BookCode)
                            .replace(';JournalAcronymSub;', this.clientUtility.activityDetails.placeHolders.JournalAcronymSub)
                            .replace(';ManuscriptZipName;/**/*', '{{ManuscriptZipName}}/**/*')

                    });
                    console.log(skipFiles, this.fileStatus.requiredFiles, 'this.fileStatus.requiredFiles')
                    let uniqueArray = this.fileStatus.requiredFiles.filter(obj1 => !skipFiles.some(obj2 => obj2.name === obj1.name));
                    this.fileStatus.requiredFiles = uniqueArray

                }

                await this.clientUtility.updateStatusToServer({ message: 'Validating Files', progress: 40 }, 2);
                if (this.clientUtility.activityDetails.iscamundaflow) {
                    await this.validate();
                }
                // if (this.clientUtility.activityDetails.activitymodeltypeflow && this.clientUtility.activityDetails.activitymodeltypeflow == 'Batch') {
                //     this.filesInfo.issueWoInfo = this.filesInfo.issueWoInfo.filter((list) => list.workorderid !=this.clientUtility.activityDetails.workOrderId);
                //     this.filesInfo.srcFiles =  this.filesInfo.srcFiles.filter((list) => !list.includes(this.clientUtility.activityDetails.itemCode));
                //     let mandatoryFiles =this.filesInfo.requiredFiles.filter((list) => list.isMandatory);

                //     let loCalvalidate =[];
                //     if(mandatoryFiles && mandatoryFiles.length > 0){
                //         mandatoryFiles.forEach((item) =>{
                //             if(item.name){
                //                 let extention  = item.name.split('.')[1]
                //                 this.filesInfo.issueWoInfo.map((list) =>{
                //                     loCalvalidate.push(list.itemcode+'.'+extention)
                //                 })
                //             }
                //         })
                //         let missedIssueFiles =  loCalvalidate.filter(file => !this.filesInfo.srcFiles.some(srcFile => srcFile.includes(file)));
                //        if(missedIssueFiles && missedIssueFiles.length > 0){
                //         this.validateIssueMissingFiles(missedIssueFiles);
                //        }
                //     } 
                // }

                await this.captureActionEntry({
                    actionType: this.action, wfeventId: this.clientUtility.activityDetails.wfEventId,
                    userId: payload.userid
                });
                await this.clientUtility.updateStatusToServer({ message: 'Validated Files', progress: 50 }, 2);
                var saveFilesToFtp = []
                var sftp = false

                // on save validation
                if (this.clientUtility.activityDetails.index == this.clientUtility.activityDetails.wfEventIds.length-1) {
                    global.log(`On Save process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                    if (this.action == 'save') {
                        await this.CheckisDirectoryBusy(this.clientUtility.pathDetails.client.path);
                        var onsaveToolId = '';
                        var serviceTool = false;
                        this.filesInfo.data.forEach(data => {
                            try {
                                this.clientUtility.activityDetails.validationFileConfig[data.typeId].files.forEach(file => {
                                    let file_save_on_sftp = (file.custom || []).filter(x => "file_save_on_sftp" == x.toLocaleLowerCase());
                                    let file_save_on_ftp = (file.custom || []).filter(x => "file_save_on_ftp" == x.toLocaleLowerCase());
                                    if (file_save_on_sftp.length > 0 || file_save_on_ftp.length > 0) {
                                        saveFilesToFtp.push(file);
                                        if (file_save_on_sftp.length > 0) {
                                            sftp = true;
                                        }
                                    }
                                })
                            } catch { }
                        });
                        if (this.clientUtility.activityDetails.config.isTypesetPage) {
                            let response = [];
                            global.log(`On Save -validateFileContentOnsave process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                            let res = await this.validateFileContentOnsave(this.wf);
                            global.log(`On Save -validateFileContentOnsave process completed ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);

                            response.push(res);
                            console.log(response, 'response for content reader');
                            if (response) {
                                console.log("pagenumber updated successfully")
                            }
                            else { throw `Invalid Page Count` }
                        }
                        let on_save_tool_validation = this.clientUtility.activityDetails.config.onSaveToolsId || [];
                        for (let index = 0; index < on_save_tool_validation.length; index++) {
                            onsaveToolId = on_save_tool_validation[index];
                            global.log(`On Save toolid ${onsaveToolId} process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                            payload.invokePayload = await getToolDetails(this.clientUtility, onsaveToolId);
                            serviceTool = payload.invokePayload.type == 2 ? false : true;
                            if (serviceTool) {
                                if(!this.clientUtility.activityDetails.iscamundaflow){
                                    let toolConfig = this.clientUtility.activityDetails.toolsConfig.tools[onsaveToolId]
                                    const inputConfig = toolConfig.files.filter(x => x.fileFlowType.includes("IN"))



                                    inputConfig.forEach((list) =>{
                                        list.name =  getFormattedName(list.name,this.clientUtility.activityDetails.placeHolders);
                                    });
                                    const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                                    for (let i = 0; i < inputConfig.length; i++) {
                                        let inputFile = inputConfig[i]
                                        const skipFileConfig = inputFile.skipFileConfig == true;
                                        this.isServerPath = inputFile.isServerPath == true;
                                        let filePath = extendedJoin([folderStructureWithRoot, inputFile.name]).replace(new RegExp(/\\/, 'g'), '/');
                                        const retreivedFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), '');
                                        const srcFiles = micromatch(retreivedFiles, filePath).map(file => extendedJoin([file]));
                                        if (srcFiles.length > 0) {
                                            for (let k = 0; k < srcFiles.length; k++) {
                                                const srcFile = extendedJoin([srcFiles[k]]);
                                                const isRootFile = !srcFile.includes(folderStructureWithRoot);
                                                const srcFileName = basename(srcFile);
                                                const dirName = extendedJoin([dirname(srcFile), '/']);
                                                const intermediatePath = dirName.replace(isRootFile ? folderStructureWithRoot : folderStructureWithRoot, '');
                                                const path = (intermediatePath ? extendedJoin([intermediatePath], false) : '') + srcFileName;
                                                const relativeSrc = extendedJoin([srcFile], false).replace(this.clientUtility.pathDetails.client.path, '');
                                                let fileDetail = {
                                                    src: srcFile, relativeSrc, srcName: srcFileName,
                                                    dest: path
                                                };
                                                console.log(fileDetail)
                                                this.fileStatus.tool.push(fileDetail)
                                            }
                                        } else {
                                        let missedFile ={srcName: basename(filePath) }
                                            this.fileStatus.missedFile.push(missedFile)
                                        }
                                    }
                                }
                                await this.fetchToolStatus(onsaveToolId);
                                global.log(`On Save uploadToolFiles toolid ${onsaveToolId} process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                                await this.uploadToolFiles(onsaveToolId);
                                global.log(`On Save uploadToolFiles toolid ${onsaveToolId} process completed ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);

                                await this.clientUtility.updateStatusToServer({ message: 'On save tool validation started', progress: 80 }, 2);
                                try {
                                    global.log(`On Save-onSaveValidationForServiceTools toolid ${onsaveToolId} process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                                    await onSaveValidationForServiceTools(this.clientUtility, payload, { toolId: onsaveToolId }, this.filesInfo, this.action);
                                    global.log(`On Save-onSaveValidationForServiceTools toolid ${onsaveToolId} process completed ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);

                                } catch (err) {
                                    throw  err || `error in on save validation for tools`
                                }
                                await this.clientUtility.updateStatusToServer({ message: 'On save tool validation completed', progress: 95 }, 2);
                            }
                            else {
                                await this.clientUtility.updateStatusToServer({ message: 'On save tool validation started', progress: 80 }, 2);
                                this.clientUtility.activityDetails.selectedTool = onsaveToolId;
                                try {
                                    global.log(`On Save-onSaveValidationForTools toolid ${onsaveToolId} process started ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                                    await onSaveValidationForTools(this.clientUtility, payload, { toolId: onsaveToolId }, this.filesInfo, this.action);
                                    global.log(`On Save-onSaveValidationForTools toolid ${onsaveToolId} process completed ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                                } catch (err) {
                                    throw err?.message || 'error in on save validation for tools';
                                }
                                await this.clientUtility.updateStatusToServer({ message: 'On save tool validation completed', progress: 95 }, 2);
                            }
                        }
                        // if (arr && arr.length >= 1) {
                        //     for (var i = 0; i < arr.length; i++) {
                        //         onsaveToolId = arr[i].custom.on_save_tool_validation.toolId
                        //         serviceTool = arr[i].custom.on_save_tool_validation.serviceTool ? arr[i].custom.on_save_tool_validation.serviceTool : false
                        //         if (serviceTool) {
                        //             await this.fetchToolStatus(onsaveToolId);
                        //             await this.uploadToolFiles(onsaveToolId)
                        //             await this.clientUtility.updateStatusToServer({ message: 'On save tool validation started', progress: 80 }, 2)
                        //             try {
                        //                 await onSaveValidationForServiceTools(this.clientUtility, payload, arr[i].custom.on_save_tool_validation, this.filesInfo, this.action)
                        //             } catch (err) {
                        //                 throw err || `error in on save validation for tools`;
                        //             }
                        //             await this.clientUtility.updateStatusToServer({ message: 'On save tool validation completed', progress: 95 }, 2)
                        //         }
                        //         else {
                        //             await this.clientUtility.updateStatusToServer({ message: 'On save tool validation started', progress: 80 }, 2)
                        //             await onSaveValidationForTools(this.clientUtility, payload, arr[i].custom.on_save_tool_validation, this.filesInfo, this.action)
                        //             await this.clientUtility.updateStatusToServer({ message: 'On save tool validation completed', progress: 95 }, 2)
                        //         }
                        //     }
                        // }
                        // to deleted
                        // if (this.clientUtility.activityDetails.config.postActivity && this.clientUtility.activityDetails.config.postActivity.length > 0) {
                        //     var isGraphicOnSaveReq = await checkGraphicEnabled(this.clientUtility)
                        //     if (isGraphicOnSaveReq.length > 0) {
                        //         await graphiconsave(this.clientUtility.activityDetails.config.postActivity, this.clientUtility, isGraphicOnSaveReq)
                        //     }
                        // }
                        let isXLUpload = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "isxlupload").length > 0);
                        if ((isXLUpload.length > 0) || (saveFilesToFtp.length > 0 && !sftp)) {
                            // let attachFiles = this.fileStatus.inValid.length > 0 ? this.fileStatus.inValid : this.fileStatus.noChange;
                            let attachFiles1 = [...this.fileStatus.inValid, ...this.fileStatus.new];
                            let attachFiles = new Set([...attachFiles1, ...this.fileStatus.noChange]);
                            const mergedArray = [...attachFiles];
                            await uploadxltoFTP(this.clientUtility, mergedArray, saveFilesToFtp, payload.journalid);
                        }
                        let newWordCount = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "iswordcountforfile").length > 0);
                        if ((newWordCount.length > 0)) {
                            let parts = newWordCount[0]?.name.split(';');
                            let result = parts[parts.length - 1];
                            await isWordCountForFile(this.clientUtility,result);
                        }
                        let isWordCountReq = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "iswordcountreq").length > 0);
                        if ((isWordCountReq.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await isWordCount(this.clientUtility);
                        }
                        let isTypesetFromPDF = files[0]?.filter((item) => item.custom.includes("istypesetfrompdf"));
                        if ((isTypesetFromPDF !== undefined && isTypesetFromPDF.length > 0)) {
                            await pageCountFromPDF(this.clientUtility,isTypesetFromPDF);
                        }

                        let isTypesetFromPageInfo = files[0]?.filter((item) => item.custom.includes("istypesetfrompageinfo"));
                        if ((isTypesetFromPageInfo?.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await isTypesetPgeFromPageInfo(this.clientUtility,isTypesetFromPageInfo);
                        }


                        let isTypesetFromPageWord = files[0]?.filter((item) => item.custom.includes("istypesetfromword"));
                        if ((isTypesetFromPageWord !== undefined && isTypesetFromPageWord.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await isTypesetPgeFromWord(this.clientUtility,isTypesetFromPageWord);
                        }

                        let isincomingFrompdf = files[0]?.filter((item) => item.custom.includes("incomingfrompdf"));
                        if ((isincomingFrompdf !== undefined && isincomingFrompdf.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await isIncomingFromPdf(this.clientUtility,isincomingFrompdf);
                        }
                        let incomingfromword = files[0]?.filter((item) => item.custom.includes("incomingfomword"));
                        if ((incomingfromword !== undefined && incomingfromword.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await isIncomingFromWord(this.clientUtility,incomingfromword);
                        }
                        let incomingfrompageinfo = files[0]?.filter((item) => item.custom.includes("incomingfrompageinfo"));
                        if ((incomingfrompageinfo !== undefined && incomingfrompageinfo.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await isIncomingFromPageInfo(this.clientUtility,incomingfrompageinfo);
                        }
                        let imageupload = files[0]?.filter((item) => item.custom.includes("imageupload"));
                        if ((imageupload !== undefined && imageupload.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await imageUpload(this.clientUtility,imageupload);
                        }

                        //Wordcount from txt file updated Generic method
                        let isWordCountReqFromTxt = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "iswordcountreqfromtxt").length > 0);
                        if ((isWordCountReqFromTxt.length > 0)) {
                            let filePath, formattedFilePath;
                            //Construction the file path based on flow type
                            if (this.clientUtility.activityDetails.iscamundaflow){
                                filePath =isWordCountReqFromTxt[0].name
                                formattedFilePath = join(clientUtility.pathDetails.client.path, filePath ? getFormattedName(filePath, this.clientUtility.activityDetails.placeHolders) : '')
                            }else{
                                //Need to test this for non camunda flow
                                formattedFilePath = this.filesInfo?.extractedFiles.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "iswordcountreqfromtxt").length > 0).outfileName;
                            }

                            await isWordCountFromTxt(formattedFilePath);
                        }

                        let isxmlValdReq = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "isxmlvalidationreq").length > 0);
                        if ((isxmlValdReq.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await onSaveXmlValidation(this.clientUtility, isxmlValdReq[0].name);

                        };

                        let readXmlExportFile = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "readxmlexport").length > 0);
                        if ((readXmlExportFile.length > 0)) {
                            //     await uploadxltoFTP(this.clientUtility,attachFiles,saveFilesToFtp,payload.journalid);
                            await readXmlExport(this.clientUtility, readXmlExportFile[0].name);

                        }

                        let ishtmValdReqforcup = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "ishtmvalidationreqforcup").length > 0);
                        if ((ishtmValdReqforcup.length > 0)) {
                            await ishtmValdReq(this.clientUtility);
                        }
                        let onsavemailtrigger = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "onsavemailtrigger").length > 0);
                        if (onsavemailtrigger.length > 0 && payload.journalAcronym && payload.journalAcronym != 'AMDM') {
                            let attachFiles1 = [...this.fileStatus.inValid, ...this.fileStatus.new];
                            let attachFiles = new Set([...attachFiles1, ...this.fileStatus.noChange]);

                            const mergedArray = [...attachFiles];
                            mergedArray.forEach((file) => {
                                file.fullPath = file.dest + file.srcName;
                            });
                            await onSaveMailTrigger(this.clientUtility, mergedArray, onsavemailtrigger, payload);
                        }
                    }
                }
                //await this.clientUtility.logLocalWorkingFolder("Sync File");
                try {
                    if (this.action == 'save'||this.action == 'pending' || this.action == 'reject') 
                    {
                        let saveasZip = files?.length > 0 && files && files[0].filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "saveaszip").length > 0);
                        if ((saveasZip.length > 0)) 
                        {
                            let zipFilePath=[]
                            saveasZip.forEach((file) => {
                                 let fullPath = join(this.clientUtility.pathDetails.client.path,basename(file.name));
                                zipFilePath.push(fullPath);
                            });
                            if (zipFilePath.length>0) {
                                for( let i=0;i<zipFilePath.length;i++)
                                {
                                    let folderPath=zipFilePath[i]
                                    folderPath=await getFormattedName(folderPath,this.clientUtility.activityDetails.placeHolders)
                                    if(await isDirExist(folderPath))
                                    {
                                        let zipfolder=this.fileStatus.new.filter(str => str.src.includes(folderPath))

                                        this.fileStatus.new = this.fileStatus.new.filter(str => !str.src.includes(folderPath));

                                        let destinationPath= join(folderPath,`${basename(folderPath)}.zip`)
                                        if(zipfolder && zipfolder.length>0)
                                        {
                                                let zipName=basename(destinationPath)
                                                zipfolder=zipfolder[0]
                                                zipfolder.srcName=zipName
                                                zipfolder.src=join(dirname(zipfolder.src),zipName)
                                                zipfolder.relativeSrc=join(basename(folderPath),zipName)
                                            this.fileStatus.new.push(zipfolder)
                                        }
                                        const retreivedFiles = await retreiveLocalFiles(extendedJoin([folderPath, '**', '*']), '');
                                        if(retreivedFiles&&retreivedFiles.length>=1)
                                        {
                                            if(isPathExist(destinationPath) && retreivedFiles.length==1)
                                            {
                                                continue;
                                            }
                                            if(isPathExist(destinationPath) && retreivedFiles.length>1)
                                            {
                                                await removeFile(destinationPath)
                                            }
                                            try {
                                                await createZipAndDeleteSourceFiles(folderPath,destinationPath);
                                            } catch (err) 
                                            {
                                                throw `The zip creation process failed, so the copy to the server was not completed.`
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    global.log(`Before calling uploadFiles  ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                    global.log(this.fileStatus.new.map((file) => file.src), 'Before calling uploadFiles=> New files');
                    global.log(this.fileStatus.update.map((file) => file.src), 'Before calling uploadFiles=> Update files');
                    global.log(this.fileStatus.noChange.map((file) => file.src), 'Before calling uploadFiles=> No Change files');
                    global.log(this.fileStatus.inValid.map((file) => file.src), 'Before calling uploadFiles=> InValid files');
                    global.log(this.fileStatus.requiredFiles.map((file) => file.name), 'Before calling uploadFiles=> Missed files');
                    try{
                        await this.uploadFiles();
                    }catch(error){
                        global.log(`Upload error: ${JSON.stringify(error)} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                        if (error && error != undefined && error != null && error != "" && Array.isArray(error)) {
                            for (const errObj of error) {
                                const msg = errObj?.message;
                                if (typeof msg === 'string') {
                                    if (msg.includes("ECONNREFUSED")) {
                                        throw "Error occurred while connecting to the file upload service";
                                    } else if (msg.includes("ECONNRESET")) {
                                        throw "Error occurred in file upload process due to network issue";
                                    }
                                }
                            }
                            global.log(`Upload error is array type: ${JSON.stringify(error)} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                            throw `Error in file upload process due to network issue`;
                        }

                        if (error && typeof error === 'object' && error != null && error != undefined && error != "") {
                            const message = error.message;

                            if (typeof message === 'string' && message != null && message != undefined && message != "") {
                                if (message.includes("ECONNREFUSED")) {
                                    throw "Error occurred while connecting to the file upload service";
                                } else if (message.includes("ECONNRESET")) {
                                    throw "Error occurred in file upload process due to network issue";
                                }
                                global.log(`Upload error in message: ${message} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                                throw `Error in file upload process due to network issue`;
                            }
                            global.log(`Upload error as object : ${JSON.stringify(error)} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);    
                            throw `Error in file upload process due to network issue`;
                        }
                        if (error && typeof error === 'string' && error != null && error != undefined) {
                            if (error.includes("ECONNREFUSED")) {
                                throw "Error occurred while connecting to the file upload service";
                            } else if (error.includes("ECONNRESET")) {
                                throw "Error occurred in file upload process due to network issue";
                            }
                        }
                        global.log(`Fallback error:${String(error)} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                        // Fallback if error is not an object
                        throw `Error in file upload process due to network issue`;
                    }
                    global.log(this.filesInfo.insertTrnFiles, 'this.filesInfo.insertTrnFiles');
                    global.log(this.filesInfo.updateTrnFiles, 'this.filesInfo.updateTrnFiles');
                    global.log(`after calling uploadFiles  ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                    //Insert and Update Trancesection table
                    const promises = [];
                    if (this.filesInfo.insertTrnFiles.length > 0) {
                        promises.push(this.insertTrnFiles());
                    }
                    if (this.filesInfo.updateTrnFiles.length > 0) {
                        promises.push(this.updateTrnFiles());
                    }
                    await Promise.all(promises);



                } catch (err) {
                    if (this.clientUtility.activityDetails.dmsType == 'local' && err && err.message && err.message.code === 'EBUSY') {
                        throw ` Please close the ${basename(err.message.path)} opened in the Server location`
                    } else {
                        // reject(err)
                        throw `${err}`
                    }
                }
                if (this.clientUtility.activityDetails.config && Object.keys(this.clientUtility.activityDetails.config).length > 0 && Object.keys(this.clientUtility.activityDetails.config).includes('syncLocalDelete') && this.clientUtility.activityDetails.config.syncLocalDelete) {
                    await this.lockFileSyncStatus();

                }
                this.clientUtility.updateFileDetails = true

                if (this.clientUtility.activityDetails.stage.id == '10' && this.action == 'imageUpload' && payload.serverpath && this.clientUtility.activityDetails.du.id != 92) {
                    payload.activityId = this.clientUtility.activityDetails.activity.id
                    if (payload.serverpath && payload.serverpath.length > 0) {
                        if(this.clientUtility.activityDetails.iscamundaflow){
                            console.log("GRAPHIS inside", this.action);
                            let conditionData = this.filesInfo.data.filter(x => this.clientUtility.activityDetails.validationFileConfig[x.typeId]);
                            let awt = [];
                            conditionData.forEach(element => {
                                let files = this.clientUtility.activityDetails.validationFileConfig[element.typeId].files
                                files = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "graphics_tooldwmsserverpath").length > 0);
                                files.forEach(file => {
                                    awt.push(limit(() => this.ShareFilesyncCall(file, element, payload)));
                                });
                            });
                            await Promise.all(awt);
                    }else{
                            await this.ShareFilesyncCall(null, null, payload);

                        }
                    } else {
                        reject('Serverpath missing please contact iwms Administrator')
                    }
                }
           
                if (this.clientUtility.activityDetails.stage.id == '10' && this.clientUtility.activityDetails.activity.id == 101 && this.action == 'save' && this.clientUtility.activityDetails.du.id == 92) {
                    try {
                        const clientUtilityBasePAth = this.clientUtility.activityDetails.fileType;
                        let destPathForImage = extendedJoin([
                            this.clientUtility.pathDetails.okm.path,
                            `${clientUtilityBasePAth.name.toLowerCase()}_${clientUtilityBasePAth.id}`,
                            clientUtilityBasePAth.fileId, this.clientUtility.activityDetails.itemCode
                        ]);
                        console.log(destPathForImage);
                        // const sourceExists = await fs.pathExists(extendedJoin([destPathForImage, 'Images/']));
                        // if (!sourceExists) {
                        //     throw new Error(`The source directory does not exist:'Images/`);
                        // }
                        let zipPath = extendedJoin([destPathForImage, 'Images.zip']);
                        const payload = {
                            "sourcePath":extendedJoin([destPathForImage, 'Images/']),
                            "destPath": zipPath
                        }
                        await localHelper.createZipInLocalServer(payload)
                        this.filesInfo.insertTrnFiles.push({
                            uuid: 'local',
                            path: zipPath.replace(/\\/g, '/'),
                            fileId: clientUtilityBasePAth.fileId,
                            wfeventid: this.clientUtility.activityDetails.wfEventId,
                        })
                        console.log( "trn details",this.filesInfo.insertTrnFiles);
                       await this.insertTrnFiles()
                    } catch (err) {
                        throw ('Failure in Image zip creation ', err)
                    }


                }
                //Need to handle un updated mandatory files in server start
                await this.fileVersionValidation();
                //Need to handle un updated mandatory files in server end
                if (this.clientUtility.activityDetails.wfEventIds.length - 1 == this.clientUtility.activityDetails.index) {
                    await this.clientUtility.updateStatusToServer({ message: 'success' }, 1);
                };
                global.log(`Overall save process completed=>  ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);

                resolve();
            } catch (err) {
                global.log(`Save process failed 1=> error : ${err} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
                if (typeof err === "string") {
                    global.log(`Save process failed 2=> error : ${err} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);

                    reject({
                        message: err,
                        onsaveToolId: onsaveToolId ? onsaveToolId : "",
                    });
                } else {
                    global.log(`Save process failed 3=> error : ${err} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);

                    err.onsaveToolId = onsaveToolId ? onsaveToolId : "";
                    reject(err);
                };
                global.log(`Save process failed catch relased=> error : ${err} - ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
            }
        });
    }

    async fetchToolStatus(onsaveToolId) {
        let toolConfig = this.clientUtility.activityDetails.toolsConfig.tools[onsaveToolId]
        const inputConfig = toolConfig.files.filter(x => x.fileFlowType.includes("IN"))
        const inputKeys = Object.keys(inputConfig);
        for (let i = 0; i < inputKeys.length; i++) {
            const inputKey = inputKeys[i];
            const inputFile = inputConfig[inputKey];
            const inputFileTypeId = inputFile.fileTypes instanceof Array ? inputFile.fileTypes : [inputFile.fileTypes];
            const fTypeName = inputFile.fileTypeName; // || inputFile.name;
            // if (inputFile.isSync == false) continue;
            const skipFileConfig = inputFile.skipFileConfig == true;
            const lwfDetails = inputFile.lwf && inputFile.lwf.src ? {
                src: inputFile.lwf.src, isRoot: !!inputFile.lwf.isRoot
            } : { src: '', isRoot: false };
            const formattedFTypeName = fTypeName ? getFormattedName(fTypeName, this.clientUtility.activityDetails.placeHolders) : '';
            const formattedFTypeNameRegex = new RegExp(formattedFTypeName);
            const filteredfileDetails = this.filesInfo.data.filter(fd => {
                const formattedFTypeNameResult = fd.name.match(formattedFTypeNameRegex);
                // const isTypeNameMatched = (!fTypeName.includes(';')  ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                const isTypeNameMatched = (fTypeName  ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                return inputFileTypeId.includes(parseInt(fd.typeId)) && isTypeNameMatched &&
                    ((this.clientUtility.activityDetails.fileType.fileId && fd.allowSubFileType) ? fd.incomingFileId == this.clientUtility.activityDetails.fileType.fileId : true)
            });
            for (let j = 0; j < filteredfileDetails.length; j++) {
                const { name: fileTypeName, typeId, incomingFileId, wfeventid, key, basePath, files, pageRange } = filteredfileDetails[j];
                const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                const excludedFiles = [];
                this.filesInfo.data.forEach((data) => {
                    if (fileTypeName != data.name) excludedFiles.push(extendedJoin([this.clientUtility.pathDetails.client.path, data.name, '**', '*']));
                });
                const formattedName = getFormattedName(lwfDetails.src ? lwfDetails.src : inputFile.name, { ...this.clientUtility.activityDetails.placeHolders, FileTypeName: fileTypeName, PageRange: pageRange });
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
                        fileValidationStatus = await this.getToolsFileDetail(inputFile, basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                    } else {
                        this.clientUtility = this.clientUtility.activityDetails ? this.clientUtility : this.clientUtility.clientUtility
                        fileValidationStatus = await this.isValidFile(basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                    }
                    const dest = dirname(fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) == '.' ? '' : dirname(fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) + '/';
                    const fileDetail = {
                        inputKey, src: srcFile, relativeSrc, srcName: fileValidationStatus.lwfDetails.src ? basename(fileValidationStatus.lwfDetails.name) : srcFileName,
                        dest: basePath + dest, typeId, fileId: incomingFileId, wfeventid: wfeventid
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
                    this.fileStatus.tool.push(fileDetail);

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

    async uploadToolFiles(onsaveToolId) {

        return new Promise(async (resolve, reject) => {
            try {
                let files = [...this.fileStatus.tool]
                // const progressDetails = {
                //     currentProgress: 50,
                //     fileProgress: 40 / files,
                //     completedFileCount: 0,
                //     totalFileCount: files.length
                // }
                // this.tool.id = onsaveToolId 
                let allFiles = [];
                let awat = [];
                if (this.filesInfo.data.length >= 1) {

                    for (let i = 0; this.filesInfo.data.length > i; i++) {
                        this.blobPath = this.filesInfo.data[i].basePath + `tool/${onsaveToolId}/In/`;

                        switch (this.clientUtility.activityDetails.dmsType) {
                            case "azure":
                                allFiles = await getRetreiveBlobFilesURL(this.blobPath)
                                for (let i = 0; i < allFiles.length; i++) {
                                    let filePath = allFiles[i].path
                                    awat.push(azureHelper.deleteFile(filePath));
                                }
                                break
                            case "local":
                                allFiles = await localHelper.getRetreivelocalFilesURL(this.blobPath)
                                for (let i = 0; i < allFiles.length; i++) {
                                    let filePath = allFiles[i].path
                                    awat.push(localHelper.deletelocalFile(filePath));
                                }
                                break;
                            default:
                                break;

                        }
                        await Promise.all(awat);

                    }
                }
                //  const pth = this.filesInfo.data[0].basePath + `tool/${onsaveToolId}/In/`


                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if(this.clientUtility.activityDetails.iscamundaflow){
                        let basepath = this.filesInfo.data.filter(x => x.basePath == file.dest).map(path => path.basePath)
                        if (basepath && basepath.length) {
                            file.dest = basepath + `tool/${onsaveToolId}/In/` + file.dest.replace(basepath, '');
                        } else {
                            //to handle folder path
                            file.dest = this.filesInfo.data[0].basePath + `tool/${onsaveToolId}/In/` + file.dest.replace(this.filesInfo.data[0].basePath, '');
                        }
                }else{
                        // file.dest.replaceAll('\\','/')
                        file.dest = this.clientUtility.activityDetails.newFileCopyBasePath + `tool/${onsaveToolId}/In/`

                    }
                    // await this.updateUploadProgressDetails(file, progressDetails, true);
                    await this.uploadNewFile(file);
                    // await this.updateUploadProgressDetails(file, progressDetails, false);
                }
                // }
                // else {
                //     await this.clientUtility.updateStatusToServer({ message: `Uploading Completed`, progress: progressDetails.currentProgress }, 2);
                // }
                resolve();
            } catch (err) {
                reject(err);
                console.log(err)
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
    async ShareFilesyncCall(file, files, payload) {
        // const folderStructurePaylod = {
        //     type: this.clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
        //     du: { name: this.clientUtility.activityDetails.du.name, id: this.clientUtility.activityDetails.du.id },
        //     customer: { name: this.clientUtility.activityDetails.customer.name, id: this.clientUtility.activityDetails.customer.id },
        //     workOrderId: this.clientUtility.activityDetails.workOrderId,
        //     service: { name: this.clientUtility.activityDetails.service.name, id: this.clientUtility.activityDetails.service.id },
        //     stage: { name: this.clientUtility.activityDetails.stage.name, id: this.clientUtility.activityDetails.stage.id, iteration: this.clientUtility.activityDetails.stage.iteration },
        //     activity: { name: this.clientUtility.activityDetails.activity.name, id: this.clientUtility.activityDetails.activity.id, iteration: this.clientUtility.activityDetails.activity.iteration },
        //     fileType: { name: this.clientUtility.activityDetails.fileType.name, id: this.clientUtility.activityDetails.fileType.id, fileId: this.clientUtility.activityDetails.fileType.fileId },
        // };

        //below code recently commended due to no use   

        // var fileDetailsInIncoming = await this.getIncomingFileTypeDetails(this.clientUtility);
        // var fileterdDetailsName = fileDetailsInIncoming && fileDetailsInIncoming.length > 0 && this.clientUtility.activityDetails.fileType && this.clientUtility.activityDetails.fileType.id && fileDetailsInIncoming.filter((list) => list.filetypeid == this.clientUtility.activityDetails.fileType.id);
        // this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, 'FileTypeName': files.name };



        // var sourcePath = await getFileTypeFolderStructure(folderStructurePaylod);
        // const path = (fileterdDetailsName && fileterdDetailsName.length > 0 ? extendedJoin([sourcePath], false) : '') + files.name;
        // switch (this.clientUtility.activityDetails.dmsType) {
        //     case "azure":
        //         uuid = "azure";
        //         break;
        //     case "local":
        //         uuid = "local";
        //         break;
        //     default:
        //         uuid = await okmHelper.getUuid(path);
        //         break;
        // }
        // if (file.customFilePath) {
        //     var targetPath = file.customFilePath;
        //     targetPath = getFormattedName(targetPath, this.clientUtility.activityDetails.placeHolders);
        // }
        if (payload.deletedImages.length > 0) {
            let serverPath =  this.clientUtility.activityDetails?.activity.id =='170' ? join(payload.serverpath,'Print','\\') : payload.serverpath
            await this.deletePath(payload.deletedImages, serverPath, this.clientUtility.activityDetails.customer.id);
        }
        // var retreiveOKMFiless = await retreiveOKMFiles(path, this.clientUtility.activityDetails.dmsType);
        // if(payload.newUploadedImages && retreiveOKMFiless){
        //      retreiveOKMFiless = retreiveOKMFiless.filter((item) => Array.from(payload.newUploadedImages).find((file) =>   file.reverse === item.path.split('/')[item.path.split('/').length -1 ] ));
        // }

        //         console.log(sourcePath, "safsfsd,filePath", uuid,retreiveOKMFiless);

        //    console.log(sourcePath, "safsfsd,filePath", uuid,retreiveOKMFiless);
        //     payload.activityDetails.uuID = uuid;
        //     payload.activityDetails.path = path;
        payload.path.filepath = payload.serverpath;
        // payload.path.fileName = files.name;
        payload.path.id = 'fromSave';
        payload.newUploadedImages = payload.newUploadedImages;;
        return new ShareFilesync(this.clientUtility).startProcess(payload);
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

    async deletePath(deletedImages, targetPath, customerId) {
        return new Promise(async resolve => {
            try {

                let DeletePaths = []
                deletedImages.map((list) => {
                    DeletePaths.push(path.join(targetPath, list.reverse)); //Delete not required confirmed by T&E
                    // adding hardcoded folder name for springer journal
                    if (customerId == '10') {
                        DeletePaths.push(path.join(targetPath, 'Print', list.reverse)); //Delete not required confirmed by T&E
                    }
                })

                console.log(DeletePaths, 'DeletePaths');

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
    async validateFilePaths(folderPath) {
        return new Promise(async (resolve, reject) => {
            try {
                let invalidFiles = 0;
                folderPath.forEach(async FileName => {
                    console.log(FileName)
                    const FileNameRegexPattern = /^[A-Za-z0-9~!@$*()-_=|;:'",.<>/? ]+$/
                    var regexFormat = new RegExp(FileNameRegexPattern, "g")
                    if (FileName.includes('[') || FileName.includes(']') || FileName.includes('^') || FileName.includes('+')) {
                        invalidFiles++
                        console.log(`String ${FileName}:  matches the pattern.`);
                        reject('The filename contains other languages or junk characters.' + FileName);
                        throw 'The filename contains other languages or junk characters.' + FileName;
                    }
                    else if (regexFormat.test(FileName)) {
                    }
                    else {
                        invalidFiles++
                        console.log(`String ${FileName}:  matches the pattern.`);
                        reject('The filename contains other languages or junk characters.' + FileName);
                        throw 'The filename contains other languages or junk characters.' + FileName;
                    }
                })
                if (invalidFiles == 0) {
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
        let DOI = this.clientUtility.activityDetails.placeHolders.DOI ? this.clientUtility.activityDetails.placeHolders.DOI : ''
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]), __DOI__: DOI ? DOI.replaceAll('/', '_') : '' };
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
            iscamundaflow: this.clientUtility.activityDetails.iscamundaflow



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

        if (filesAdditionalInfo?.extractedFiles.length > 0) {
            let updatedPayload = filesAdditionalInfo?.extractedFiles.filter(file => (file.fileFlowType || []).filter(x => x.toLocaleLowerCase() === "out").length > 0);
            updatedPayload = await this.updateCopyPaths(updatedPayload);
            this.filesInfo.extractedFiles = updatedPayload
            this.clientUtility.activityDetails.newFileCopyBasePath  =filesAdditionalInfo?.newFileCopyBasePath
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
            let ChapterNumber = placeHolders.FileTypeName.includes('_Chapter') ? placeHolders.FileTypeName.replace('_Chapter', "") : ""

            let FileTypeName = placeHolders.FileTypeName ? placeHolders.FileTypeName : ''
            let piivalue = ((placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == placeHolders.FileTypeName).pop() || {}).piinumber;
            // let piivalue = await this.getFileNameForPii({ workOrderId: this.clientUtility.activityDetails.workOrderId, fileName :FileTypeName  })
            piivalue = piivalue != '' ? piivalue : ''
            placeHolders = { ...placeHolders, JnlTypeFileTypeName: JnlTypeFileTypeName, ChapterNumber, IssuePII: piivalue, zipFileName: springerZipFileName }

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
        await this.validateMissingFiles();
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

    validateMissingFiles() {
        return new Promise((resolve, reject) => {
            try {
                //const typeName= `${file.typeName && !file.lwfDetails.isRoot ? file.typeName + '/' : ''}`;
                let mandatory = this.fileStatus.requiredFiles.filter(list => list.isMandatory == true)
                if (this.clientUtility.activityDetails.wfId == 37 && this.clientUtility.activityDetails.isOtherArticle) {
                    if (mandatory.length) throw `Following mandatory files are missing.\n ${mandatory.map(file => {
                        return `${file.name}${file.key ? '' : ` (${this.getFileTypeName(file.typeId)})`}`;
                    }).join(', ')} `;
                }
                else {
                    if (this.fileStatus.requiredFiles.length) throw `Following mandatory files are missing.\n ${this.fileStatus.requiredFiles.map(file => {
                        // return `${file.lwfDetails.src ? file.lwfDetails.src : file.name}${file.key ? '' : ` (${this.getFileTypeName(file.typeId)})`}`
                        // lwf changes for cup
                        //return Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id == '1' ? `${file.name}${file.key ? '' : ` (${this.getFileTypeName(file.typeId)})`}` : `${file.lwfDetails.src ? file.lwfDetails.src : file.name}${file.key ? '' : ` (${this.getFileTypeName(file.typeId)})`}`
                        return `${file.name}${file.key ? '' : ` (${this.getFileTypeName(file.typeId)})`}`;
                    }).join(', ')} `;

                }

                resolve(true);

            } catch (err) {
                reject(err.message ? err.message : err);
            }
        });
    }

    async customSkipValidateFiles(action) {
        try {
                const runoncondition = "runonfileskipon"+action;
                const issuetypecondition = "issuetypefileskipon"+action;

            // Find if any file's custom array contains the issuetypecondition (case-insensitive)
            const runOnFileValidationSkip = this.filesInfo.extractedFiles.filter(file =>
                file.custom?.some(x => x.toLocaleLowerCase() === runoncondition)
            ) || [];

            if (runOnFileValidationSkip.length > 0) {
                const fileInfo = this.clientUtility.activityDetails.placeHolders.ArticleTypeList.find(file =>
                    file.woincomingfileid === this.clientUtility.activityDetails.placeHolders.woincomingfileid
                );
                const runOnRes = this.isPrimaryRunon(this.clientUtility.activityDetails.placeHolders.ArticleTypeList, fileInfo?.filesequence, fileInfo?.runonfilesequence)

                    if(fileInfo && runOnRes?.primary){
                    runOnFileValidationSkip.forEach(file => {
                        const fileName = path.basename(file.outfileName);
                        if (!fileName.includes(runOnRes?.primary)) {
                            file.mandatoryCheck[action] = false;
                            file.isOptional = true;
                        }
                    });
                }
            }

            // Find if any file's custom array contains the issuetypecondition (case-insensitive)
            const issueTypeFileValidationSkip = this.filesInfo.extractedFiles.filter(file =>
                file.custom?.some(x => x.toLowerCase() === issuetypecondition)
            ) || [];

            if (issueTypeFileValidationSkip.length > 0) {
                // Get the relevant file info based on incoming file ID
                const fileInfo = this.clientUtility.activityDetails.placeHolders.ArticleTypeList.find(file =>
                    file.woincomingfileid === this.clientUtility.activityDetails.placeHolders.woincomingfileid && file.issue_type === 'print'
                );

                // If matching fileInfo exists, proceed to mark the mandatoryCheck flag
                if (fileInfo) {
                    // Iterate over the extracted files to set the mandatory check flag
                    issueTypeFileValidationSkip.forEach(file => {
                        const fileName = path.basename(file.outfileName);
                        if (fileName.includes(fileInfo.FileTypeName)) {
                            file.mandatoryCheck[action] = false;
                            file.isOptional = true;
                        }
                    });
                }
            }

            const mathCount = this.filesInfo.extractedFiles.filter(file =>
                file.custom?.some(x => x.toLocaleLowerCase() === 'math_count')
            ) || [];

            if (mathCount.length > 0) {
                // If matching fileInfo exists, proceed to mark the mandatoryCheck flag
                let input;
                const regex = /<math_count>(\d+)<\/math_count>/;
                    let mathCountFile =await retreiveLocalFiles(join(this.clientUtility.pathDetails.client.path,'MathCount.txt'))
                   if(mathCountFile.length){
                    input = readFileSync(mathCountFile[0], { encoding: 'utf8' })

                    const match = input.match(regex);
                    if (match) {
                        const value = match[1];
                        if (value != "0") {
                            mathCount.forEach(file => {
                                const fileName = path.basename(file.outfileName);
                                // if (fileName.includes(fileInfo.FileTypeName)) {
                                file.mandatoryCheck[action] = true;
                                file.isOptional = false;
                                // }
                            });
                        }
                    }
                }
            }
            return true;
        } catch (err) {
            throw new Error(err.message ? err.message : err)
        }
    }

    isPrimaryRunon (articleList, filesequence, runonfilesequence) {
        // Filter the articles by runonfilesequence
        const filteredArticles = articleList.filter(article => article.runonfilesequence == runonfilesequence);

        // Find the article with the smallest filesequence
        const minFilesequenceArticle = filteredArticles.reduce((minArticle, article) => {
            return parseInt(article.filesequence) < parseInt(minArticle.filesequence) ? article : minArticle;
        });

        // Check if the given file has the smallest filesequence
        return {isprimary: parseInt(minFilesequenceArticle.filesequence) === parseInt(filesequence), primary: minFilesequenceArticle.FileTypeName};
    }

    validateIssueMissingFiles(missedIssueFiles) {
        const preActivityNameString = missedIssueFiles
            .map(item => item)
            .join(',');
        throw (
            `Following mandatory files are missing ( ${preActivityNameString} )`
        );
    }

    getFileTypeName(typeId) {
        const fileTypeDetail = this.fileTypes.find(ft => ft.filetypeid == typeId);
        return fileTypeDetail ? fileTypeDetail.filetype : '';
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
    async getFileNameForPii({ workOrderId, fileName }) {
        console.log(workOrderId, fileName)
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const data = {
            workorderId: workOrderId,
            filename: fileName
        };
        return new Promise(async (resolve, reject) => {
            try {
                if (fileName != '' && fileName != 'null') {
                    const srcFileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.uri.getFileNameForPii}`, data, headers);
                    if (srcFileDetails && srcFileDetails.data.length > 0) {
                        resolve(srcFileDetails.data && srcFileDetails.data[0]
                            ? srcFileDetails.data[0].piinumber : "")
                    }
                } else {
                    resolve()

                }
            } catch (err) {
                reject(err);
            }
        });
    }

    async fetchFileStatus() {
        // if (this.clientUtility.activityDetails.isOtherArticle) {
        //     let runOnFileSequenceMandatory = this.clientUtility.activityDetails.placeHolders.ArticleTypeList
        //     for (let k = 0; k < runOnFileSequenceMandatory.length; k++) {
        //         let data = runOnFileSequenceMandatory[k]
        //         for (let j = 0; j < this.filesInfo.requiredFiles.length; j++) {
        //             let file = this.filesInfo.requiredFiles[j]
        //             if (data.runonseq != '1' && data.runonseq != null && file.typeName == data.FileTypeName) {
        //                 file.isMandatory = false
        //             }
        //         }
        //     }
        // }

        this.fileStatus.requiredFiles = this.filesInfo.requiredFiles.filter((file) => !!file.actions[this.action] && !file.isOptional);
        let commanBasePath = await getFileTypeFolderStructure({
            type: 'wo_activity_iteration',
            du: { name: this.clientUtility.activityDetails.du.name, id: this.clientUtility.activityDetails.du.id },
            customer: { name: this.clientUtility.activityDetails.customer.name, id: this.clientUtility.activityDetails.customer.id },
            workOrderId: this.clientUtility.activityDetails.workOrderId,
            service: { name: this.clientUtility.activityDetails.service.name, id: this.clientUtility.activityDetails.service.id },
            stage: { name: this.clientUtility.activityDetails.stage.name, id: this.clientUtility.activityDetails.stage.id, iteration: this.clientUtility.activityDetails.stage.iteration },
            activity: { name: this.clientUtility.activityDetails.activity.name, id: this.clientUtility.activityDetails.activity.id, iteration: this.clientUtility.activityDetails.activity.iteration },
        })
        let fetchFileStatusFun = async (i) => {
            let filteredBookDetails = this.filesInfo.data.filter((list) => list.typeId == '1')
            const { name: fileTypeName, typeId, incomingFileId, key, basePath, files, wfeventid, pageRange } = this.filesInfo.data[i];
            let springerZipFileName = files.length > 0 ? files[0].newfilename : ""
            this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, zipFileName: springerZipFileName }
            const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
            const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
            const excludedFiles = this.filesInfo.data.filter(x => fileTypeName != x.name).map(data => (extendedJoin([this.clientUtility.pathDetails.client.path, data.name, '**', '*'])));
            let srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), excludedFiles);
            srcFiles = srcFiles.filter(x => !["Thumbs.db"].includes(basename(x)))
            this.filesInfo.srcFiles = srcFiles;
            // if (this.clientUtility.activityDetails.activitymodeltypeflow && this.clientUtility.activityDetails.activitymodeltypeflow == 'Batch') {
            //     await this.getIssueWorkorderInfo();
            //     let issueWoInfo = this.filesInfo.issueWoInfo.filter((list) => list.workorderid !=this.clientUtility.activityDetails.workOrderId)
            //     let currentArticleFiles = [];
            //     issueWoInfo.forEach((list) => {
            //         srcFiles.forEach((item) => {
            //             if (!item.includes(list.itemcode)) {
            //                 currentArticleFiles.push(item);
            //             }
            //         });
            //     });
            //     srcFiles = currentArticleFiles;
            // }
            var filteredConditionalSave = this.fileStatus.requiredFiles.filter((list) => (list.key == key && list.typeName == fileTypeName && list.typeId == typeId) && (Object.keys(list).includes('outConditionalPath') && list.outConditionalPath))
            let innerFunction = async (srcFiles) => {
                const srcFile = extendedJoin([srcFiles]);
                const isRootFile = !srcFile.includes(folderStructureWithRoot);
                const srcFileName = basename(srcFile);
                const dirName = extendedJoin([dirname(srcFile), '/']);
                const intermediatePath = dirName.replace(isRootFile ? folderStructureWithRoot : folderStructureWithRoot, '');
                const path = (intermediatePath ? extendedJoin([intermediatePath], false) : '') + srcFileName;
                const relativeSrc = extendedJoin([srcFile], false).replace(this.clientUtility.pathDetails.client.path, '');

                let JnlTypeFileTypeName = fileTypeName + this.clientUtility.activityDetails.placeHolders.JnlTypeFileName
                let ChapterNumber = fileTypeName.includes('_Chapter') ? fileTypeName.replace('_Chapter', "") : ""

                let FileTypeName = fileTypeName ? fileTypeName : ''
                // let piivalue = await this.getFileNameForPii({ workOrderId: this.clientUtility.activityDetails.workOrderId, fileName :FileTypeName  })
                let piivalue = ((this.clientUtility.activityDetails.placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == FileTypeName).pop() || {}).piinumber;
                piivalue = piivalue != '' ? piivalue : ''
                let articletype = ((this.clientUtility.activityDetails.placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == FileTypeName).pop() || {}).articletype;

                this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, JnlTypeFileTypeName: JnlTypeFileTypeName, ChapterNumber, IssuePII: piivalue, articletype: articletype }

                const fileValidationStatus = await this.isValidFile(basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                const dest = dirname(fileValidationStatus.lwfDetails && fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) == '.' ? ''
                    : dirname(fileValidationStatus.lwfDetails && fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name
                        : path) + '/';
                var filteredDirPageTargetPath = filteredConditionalSave && filteredConditionalSave.length > 0 ? dirname(filteredConditionalSave[0].name) : ""
                filteredDirPageTargetPath = filteredDirPageTargetPath.includes("**") ? filteredDirPageTargetPath.replace("**", "") : filteredDirPageTargetPath.includes("*") ? filteredDirPageTargetPath.replace("*", "") : filteredDirPageTargetPath ? filteredDirPageTargetPath : ""
                const onDemandSavePath = filteredConditionalSave && filteredConditionalSave.length > 0 && filteredDirPageTargetPath && srcFiles && srcFiles.includes(filteredDirPageTargetPath) ? extendedJoin([commanBasePath, filteredConditionalSave[0].outConditionalPath]) : '';

                const fileDetail = {
                    path: fileValidationStatus.existedFileInfo && fileValidationStatus.existedFileInfo.name ? fileValidationStatus.existedFileInfo.name : "", src: srcFile, relativeSrc, srcName: fileValidationStatus.lwfDetails && fileValidationStatus.lwfDetails.src ? basename(fileValidationStatus.lwfDetails.name) : srcFileName, wfeventid: wfeventid,
                    dest: onDemandSavePath ? onDemandSavePath : basePath + dest, typeId, fileId: onDemandSavePath && filteredBookDetails.length > 0 ? filteredBookDetails[0].incomingFileId : incomingFileId
                };

                if (fileValidationStatus.isValid) {
                    if (fileValidationStatus.isAlreadyExist && fileValidationStatus.existedFileInfo && fileValidationStatus.existedFileInfo.uuid) {
                        const existedFile = files.find((file) => file.path == fileValidationStatus.existedFileInfo.name);
                        let srcChecksum = undefined;
                        let okmChecksum = undefined;
                        let awt = [];
                        awt.push(getChecksum(srcFile).then(val => { srcChecksum = val; }).catch(err => { }));
                        switch (this.clientUtility.activityDetails.dmsType) {
                            case "azure":
                                awt.push(azureHelper.getChecksum(existedFile.path).then(val => { okmChecksum = val; }).catch(err => { }));
                                break;
                            case "local":
                                awt.push(localHelper.getlocalChecksum(existedFile.path).then(val => { okmChecksum = val; }).catch(err => { }));
                                break;
                            default:
                                awt.push(okmHelper.getChecksum(existedFile.uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                                break;
                        }
                        await Promise.all(awt);
                        if (srcChecksum == okmChecksum && srcChecksum && okmChecksum) {
                            this.fileStatus.noChange.push({ ...fileDetail, destUUID: existedFile.uuid, actFileMapId: existedFile.actfilemapid });
                        } else {
                            this.fileStatus.update.push({ ...fileDetail, destUUID: existedFile.uuid, actFileMapId: existedFile.actfilemapid });
                        }
                    } else {
                        this.fileStatus.new.push(fileDetail);
                    }
                    let index = this.fileStatus.requiredFiles.findIndex((file) => file.key == key && fileValidationStatus._lwfDetails.map(x => x.name).includes(file.name));
                    if (index !== -1) this.fileStatus.requiredFiles.splice(index, 1);
                } else {
                    // if(this.clientUtility.activityDetails.activitymodeltypeflow && this.clientUtility.activityDetails.activitymodeltypeflow == 'Batch'){
                    //     this.fileStatus.new.push(fileDetail);
                    // }else{
                    this.fileStatus.inValid.push(fileDetail);
                    // }
                }
                return;
            }
            let _awt = [];
            const _limit = pLimit(100);
            for (let j = 0; j < srcFiles.length; j++) {
                _awt.push(_limit(() => innerFunction(srcFiles[j])));
            }
            await Promise.all(_awt);
        }
        for (let i = 0; i < this.filesInfo.data.length; i++) {
            await fetchFileStatusFun(i);
        }
    }

    async uploadFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                // if (this.clientUtility.activityDetails.activitymodeltypeflow && this.clientUtility.activityDetails.activitymodeltypeflow == 'Batch') {
                //     console.log(this.filesInfo.issueWoInfo,this.filesInfo.srcFiles,this.filesInfo.requiredFiles,this.fileStatus.new.length, 'issueinfo')
                //     //need handle files validation  here
                //     // this.filesInfo.issueWoInfo = this.filesInfo.issueWoInfo.filter((list) => list.workorderid !=this.clientUtility.activityDetails.workOrderId);
                //     // this.filesInfo.srcFiles =  this.filesInfo.srcFiles.filter((list) => !list.includes(this.clientUtility.activityDetails.itemCode));
                //     // let mandatoryFiles =this.filesInfo.requiredFiles.filter((list) => list.isMandatory);

                //     // let loCalvalidate =[];
                //     // if(mandatoryFiles && mandatoryFiles.length > 0){
                //     //     mandatoryFiles.forEach((item) =>{
                //     //         if(item.name){
                //     //             let extention  = item.name.split('.')[1]
                //     //             this.filesInfo.issueWoInfo.map((list) =>{
                //     //                 loCalvalidate.push(list.itemcode+'.'+extention)
                //     //             })
                //     //         }
                //     //     })
                //     //     this.fileStatus.requiredFiles =  loCalvalidate.filter(file => !this.filesInfo.srcFiles.some(srcFile => srcFile.includes(file)));

                //     //     this.validateMissingFiles();
                //     // } 
                //     await Promise.all(this.filesInfo.issueWoInfo.map(async (list, i) => {
                //         const { workorderid, woincomingfileid } = list;
                //         const folderStructurePayload = {
                //             type: 'wo_activity_file_subtype',
                //             du: this.clientUtility.activityDetails.du,
                //             customer: this.clientUtility.activityDetails.customer,
                //             workOrderId: workorderid,
                //             service: this.clientUtility.activityDetails.service,
                //             stage: this.clientUtility.activityDetails.stage,
                //             activity: this.clientUtility.activityDetails.activity,
                //             fileType: {
                //                 name: this.clientUtility.activityDetails.fileType.name,
                //                 id: this.clientUtility.activityDetails.fileType.id,
                //                 fileId: woincomingfileid
                //             }
                //         };
                //         let destpath = await getFileTypeFolderStructure(folderStructurePayload);
                //         this.filesInfo.issueWoInfo[i].destpath = destpath;
                //     }));

                //     // this.filesInfo.issueWoInfo.forEach((list) => {
                //     //     let withoutCurrentWOInfo = this.filesInfo.issueWoInfo.lenth > 1 ? this.filesInfo.issueWoInfo.filter((wo) => wo.itemcode != list.itemcode) : this.filesInfo.issueWoInfo ;
                //     //     this.filesInfo.srcFiles.forEach((item) => {
                //     //         if (item.includes(list.itemcode) || withoutCurrentWOInfo.every((sub) => !item.includes(sub.itemcode))) {
                //     //             this.fileStatus.new.push({
                //     //                 src: item,
                //     //                 srcName: basename(item),
                //     //                 dest: list.destpath
                //     //             });
                //     //         }
                //     //     });
                //     // });
                //  let itemCodes = this.filesInfo.issueWoInfo.map(x => x.itemcode);
                //     var withoutCurrentWOInfo = [];
                //     this.filesInfo.issueWoInfo.forEach((list) => {
                //         console.log(list)
                //         withoutCurrentWOInfo = itemCodes.filter(str => !str.includes(list.itemcode));
                //         this.filesInfo.srcFiles.forEach((item) => {

                //            let isExclude = withoutCurrentWOInfo.filter(y => item.includes(y));
                //             if (item.includes(list.itemcode) || !isExclude.length) {
                //                 this.fileStatus.new.push({
                //                     src: item,
                //                     srcName: basename(item),
                //                     dest: list.destpath,
                //                     fileId : list.woincomingfileid
                //                 });
                //             }
                //         });
                //     });
                //         console.log(this.filesInfo.issueWoInfo,this.filesInfo.srcFiles,this.filesInfo.requiredFiles,this.fileStatus.new.length, 'issueinfo')
                // }
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
                            global.log(`Upload Func 1.1 file error ${_this.clientUtility?.activityDetails?.workOrderId}-${_this.clientUtility?.activityDetails?.itemCode}-${_this.clientUtility.activityDetails.activity.name}`);
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
                            global.log(`Upload Func 1.2 file error ${_this.clientUtility?.activityDetails?.workOrderId}-${_this.clientUtility?.activityDetails?.itemCode}-${_this.clientUtility.activityDetails.activity.name}`);
                            reject(err);
                        }
                    });
                }
                await this.updateFileSyncStatus();
                resolve();
            } catch (err) {
                global.log(`Upload Func 1.3 file error ${err}`);
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
        this.filesInfo.updateTrnFiles.push({
            actFileMapId: actFileMapId
        })
        // await this.updateExistingFileDetails(actFileMapId);
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
                this.filesInfo.updateTrnFiles.push({
                    actFileMapId: actFileMapId
                })
                // await this.updateExistingFileDetails(actFileMapId);
                resolve();
            } catch (err) {
                global.log(`Upload Existing File Failed  error ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name} : ${file?.src}`);
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
                            out = await localHelper.uploadlocalNewFile(src, okmDest, srcName,this.action );
                        // }
                        break;
                    default:
                        await okmHelper.deleteFile(okmDest + fileName);
                        out = await okmHelper.uploadNewFile(src, okmDest, srcName);
                        break;
                }
                const { uuid, path } = out;
                if (!file.skipTRNEntry && this.clientUtility.activityDetails.iscamundaflow) {
                    if (!path.includes('tool')) {
                        this.filesInfo.insertTrnFiles.push({
                            uuid: uuid,
                            path: path,
                            fileId: fileId,
                            wfeventid: wfeventid
                        })
                    }
                    // await this.updateNewFileDetails(uuid, path, fileId, wfeventid);
                }
                resolve();

            } catch (err) {
                global.log(`Upload File Failed Func 1.1 file error ${this.clientUtility?.activityDetails?.workOrderId}-${this.clientUtility?.activityDetails?.itemCode}-${this.clientUtility.activityDetails.activity.name}`);
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
    async mandatoryOutFileCheck(unOptionalFiles) {
        return new Promise(async (resolve, reject) => {
            try {
                let mandatorypayload = {
                    dmsType: this.clientUtility.activityDetails.dmsType,
                    data: unOptionalFiles
                }
                const response = await get(`${APIConfig.local.getBaseURL()}${APIConfig.local.url.Downloadmandatorycheck}`, mandatorypayload, {});
                this.fileStatus.mandatoryInFiles = response.filter((list) => !list.isexists) || [];
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


    async constructOutPayload(actionType) {
        let folderFiles = this.filesInfo?.extractedFiles.filter((list) => !list.isFile) || [];
        let files = this.filesInfo?.extractedFiles.filter((list) => list.isFile) || [];

        let filesUploadList = [];

        // Handle files upload list
        if (files && files.length > 0) {
            let folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
            let srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), []);
            for (let i = 0; i < files.length; i++) {
                let file = files[i];
                let isOptional = false;
                if (actionType == 'save') {
                    isOptional = file.mandatoryCheck.save;
                } else if (actionType == 'pending') {
                    isOptional = file.mandatoryCheck.pending;
                }
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
                            if (!isOptional) {
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
                            dest: directory.endsWith('\\') || directory.endsWith('/') ? directory : directory + '\\',
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
                            let subFolder = path.relative(copyInfo.sourcepath, list);
                            let folderName = path.dirname(subFolder);
                            directory= join(directory,folderName)
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

    async insertTrnFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                let fileTrnData = {
                    type: 'insert_new_file',
                    files: this.filesInfo.insertTrnFiles,
                    wfeventId: this.clientUtility.activityDetails.wfEventId
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.insertTrnFiles}`, fileTrnData, headers);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    };

    async updateTrnFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                let fileTrnData = {
                    type: 'update_existing_file',
                    files: this.filesInfo.updateTrnFiles,
                    wfeventId: this.clientUtility.activityDetails.wfEventId
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.insertTrnFiles}`, fileTrnData, headers);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    };

    async getTrnFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                let fileTrnData = {
                    wfeventId: this.clientUtility.activityDetails.wfEventId
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const response = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getEventFileDeatils}`, fileTrnData, headers);
                resolve(response);
            } catch (err) {
                reject(err);
            }
        });
    };

    async fileVersionValidation() {
        return new Promise(async (resolve, reject) => {
            try {
                if (this.clientUtility.activityDetails.iscamundaflow && 
                    this.clientUtility.activityDetails?.config?.actions?.workflow?.save?.capture?.fileValidation) {
                    let filesMissing = [];
                    let timeMisMatch = [];
                    let trnMissing = [];
                    let trnFilePaths = [];
    
                    // Fetch TRN files
                    const trnFiles = await this.getTrnFiles();
                    trnFiles?.data.forEach((list) => {
                        trnFilePaths.push(list.repofilepath);
                    });
    
                    let files = [];
                    this.filesInfo.data.forEach((element) => {
                        if (this.clientUtility.activityDetails.validationFileConfig[element.typeId]) {
                            files.push(this.clientUtility.activityDetails.validationFileConfig[element.typeId].files);
                        }
                    });
    
                    let mandatoryFiles = files.length > 0 ? files[0].filter((list) => list?.mandatoryCheck?.save) : [];
    
                    if (mandatoryFiles.length > 0) {
                        for (const list of mandatoryFiles) {
                            if (list.fileTypes.length > 0) {
                                await Promise.all(list.fileTypes.map(async (item) => {
                                    const data = this.filesInfo.data.find((list) => list.typeId == item);
                                    if (!data) return; // Skip if no matching data
    
                                    this.clientUtility.activityDetails.placeHolders.FileTypeName = data.name;
                                    let name = getFormattedName(list.name, this.clientUtility.activityDetails.placeHolders);
                                    let filteredFile = "";
                                    let basePath = data.basePath;
    
                                    if (name.includes(".")) {
                                        filteredFile = this.filesInfo.srcFiles.find(file => file === `${this.clientUtility.pathDetails.client.path}/${name}`) || "";
                                    } else {
                                        const match = name.match(/^[^/]+/);
                                        name = match && match.length > 0 ? match[0] : name;
                                        filteredFile = `${this.clientUtility.pathDetails.client.path}/${name}/`;
                                    }
    
                                    let destPath = `${basePath}${name}`;
                                    if (!name.includes(".")) {
                                        destPath += "/";
                                    }
    
                                    if (this.clientUtility.activityDetails.dmsType === "local") {
                                        if (existsSync(destPath)) {
                                            const sourceStats = statSync(filteredFile);
                                            const destinationStats = statSync(destPath);
                                            const sourceTime = sourceStats.mtime.getTime();
                                            const destinationTime = destinationStats.mtime.getTime();
    
                                            // if (!(destinationTime >= sourceTime)) {
                                            //     timeMisMatch.push(name);
                                            // }
                                            
                                            if(name.includes(".")){
                                                if (!trnFilePaths.includes(destPath)) {
                                                    trnMissing.push(name);
                                                }
                                            }else{
                                                const exists = trnFilePaths.some(filePath => filePath.startsWith(destPath));
                                                if(!exists){
                                                    trnMissing.push(name);
                                                }
                                            }
                                    
                                        } else {
                                            filesMissing.push(name);
                                        }
                                    } else {
                                        let isExist = false;
                                        let destinationTime = "";
    
                                        if (name.includes(".")) {
                                            const fileRes = await azureHelper.isFileExist(destPath);
                                            isExist = fileRes.isFileExist;
                                            destinationTime = fileRes.modifiedTime;
                                        } else {
                                            const allFiles = await getRetreiveBlobFilesURL(destPath);
                                            isExist = allFiles && allFiles.length > 0;
                                        }
    
                                        if (isExist) {
                                            if (name.includes(".")) {
                                                const sourceStats = statSync(filteredFile);
                                                const sourceTime = sourceStats.mtime.getTime();
                                                const destinationFormatTime = new Date(destinationTime).getTime();
                                                const a = new Date(new Date(sourceTime).toISOString());
                                                const b = new Date(destinationTime);
                                                a.setUTCSeconds(0, 0);
                                                b.setUTCSeconds(0, 0);
                                                // if (!(b.getTime() >= a.getTime())) {
                                                //     timeMisMatch.push(name);
                                                // }
                                                
                                                // if (a.getTime() !== b.getTime()) {
                                                //     timeMisMatch.push(name);
                                                // }
                                                if (!trnFilePaths.includes(destPath)) {
                                                    trnMissing.push(name);
                                                }
                                            }else{
                                                const exists = trnFilePaths.some(filePath => filePath.startsWith(destPath));
                                                if(!exists){
                                                    trnMissing.push(name);
                                                }
                                            }
                                   
                                        } else {
                                            filesMissing.push(name);
                                        }
                                    }
                                }));
                            }
                        }
    
                        let errorMessage = [];
    
                        if (filesMissing.length) {
                            errorMessage.push(`File missing in server: ${filesMissing.join(", ")}`);
                        }
                        // if (timeMisMatch.length) {
                        //     errorMessage.push(`Modified time mismatch (local to server): '${timeMisMatch.join("', '")}'`);
                        // }
                        if (trnMissing.length) {
                            errorMessage.push(`Transaction table files missing: ${trnMissing.join(", ")}`);
                        }
    
                
                        if (errorMessage.length > 0) {
                            let finalError = `Please check: ${errorMessage.join("; ")}. Please contact IWMS administrator.`;
                            global.log(finalError, 'File version');
                            console.log(finalError);
                            global.log(errorMessage, 'File version validate');
                            reject(finalError);
                        } else {
                            resolve(true);
                        }
                    } else {
                        resolve(true); // No mandatory files, resolve successfully
                    }
                } else {
                    resolve(true); // If `iscamundaflow` is false, resolve successfully
                }
            } catch (error) {
                global.log(error, 'File version');
                console.error("File version validation error:", error);
                reject("File version validate error, please contact IWMS Administrator.");
            }
        });
    }
    


}

module.exports = {
    Sync
};
