const { getChecksum } = require('../utils/index');
const { stat, retreiveLocalFiles, extendedJoin, getFormattedName, makeDir,getFormattedGraphicPath,getS3UploadDetails,isPathExist } = require('../utils/io');
const { getRetreiveBlobFilesURL, httpDownload } = require("../utils/azure.js");
const okmHelper = require('../utils/okm');
const { statSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { post } = require('../http/index');
const { APIConfig } = require('../../config/api');
const micromatch = require('micromatch');
const { config } = require('../../config/index');
const { basename, dirname, join } = require('path');
const { preProcessing } = require('./preprocessing');
const { copyIOFilesWithImpersonator } = require('./copyFiles');
const actions = { save: 'save', reject: 'reject', pending: 'pending', isCompulsoryCheck: 'isCompulsoryCheck' };
const pLimit = require('p-limit');
const limit = pLimit(10);
const os = require('os');
const {getIncomingFileTypeDetails}  = require('./postProcessing/onSaveValidation.js');
const AWS = require('aws-sdk')
 const { rmSync, unlinkSync, existsSync, lstatSync } = require('fs');

class SyncToolsFile {
    fileStatus = {
        new: [],
        update: [],
        noChange: [],
        inValid: [],
        missedFile: [],
        missedFileType: []
    };
    fileTypes = [];
    tool = {
        id: null,
        fileConfig: null
    };
    isFileSynced = false;
    isServerPath = false;
    isS3Upload = false;
    filesInfo = {
        data: [],
         extractedFiles:[]
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
                await this.preProcessing(payload)
                if(this.clientUtility.activityDetails.iscamundaflow){
                    await this.fetchFileStatus();
                }else{
                    let inputConfig,excludedFiles;
                    if (this.clientUtility.isOut == false) {
                        inputConfig = this.tool.fileConfig.filter(x=>(x.fileFlowType||[]).includes("IN"));
                    } else {
                        inputConfig =  this.tool.fileConfig.filter(x=>(x.fileFlowType||[]).includes("OUT"));
                        if(this.clientUtility.activityDetails.toolsConfig.tools[this.tool.id]?.isSuccessAndDeleteError) {
                            await this.checkMandatoryToolSuccess();
                        }
                    };
                    this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, localworkingfolder: this.clientUtility.activityDetails.placeHolders.__WF__ };
                    // this.clientUtility.activityDetails.placeHolders ={ ...this.clientUtility.activityDetails.placeHolders, filename :this.clientUtility.activityDetails.placeHolders.ArticleTypeList[0].FileTypeName}; 
                    let fileType = inputConfig.filter(a => a.name.includes('FileTypeName'))
                    if (this.clientUtility.activityDetails.woType == 'Book' && fileType?.length > 0) {
                        let filesArray = [];
                        const fileTypesInArray1 = new Set(
                            inputConfig.flatMap(item => item.fileTypes)
                        );

                        const matchingFileTypes = this.clientUtility.activityDetails.placeHolders.ArticleTypeList.filter(item =>
                            fileTypesInArray1.has(parseInt(item.FileTypeId))
                        );
                        matchingFileTypes.forEach(newItem => {
                            inputConfig.forEach(baseItem => {
                                //   let newObject = { ...baseItem };
                                //   const fileExtension = baseItem.name.split('.').pop(); // Get the existing extension
                                //   newObject.name = `${newItem.FileTypeName}.${fileExtension}`; // Set the new name

                                //   filesArray.push(newObject);
                                const newName = baseItem.name.replace(";FileTypeName;", newItem.FileTypeName);
                                const newObject = {
                                    ...baseItem,
                                    name: newName, // Set the new name
                                };
                                filesArray.push(newObject);
                            });
                        });
                        inputConfig = filesArray
                    }
                    else {
                        inputConfig.forEach((list) => {
                            list.name = getFormattedName(list.name, this.clientUtility.activityDetails.placeHolders);
                        });
                    }
                    if(this.clientUtility.isOut ){
                        inputConfig.forEach(file => 
                             this.fileStatus.new.push(file.name)
                        )
                    }else{

                    //    let file=  await getFormattedGraphicPath(this.clientUtility.activityDetails)
                        const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);

                        for (let i = 0; i < inputConfig.length; i++) {
                            let inputFile = inputConfig[i]
                            const skipFileConfig = inputFile.skipFileConfig == true;
                            this.isServerPath = inputFile.isServerPath == true 
                            this.isS3Upload= this.tool.fileConfig.filter((list) => list.isS3Upload).length > 0
                            let fileCheck = this.isServerPath || this.isS3Upload;
                            if(!fileCheck){
                            let filePath = extendedJoin([folderStructureWithRoot, inputFile.name]).replace(new RegExp(/\\/, 'g'), '/');

                            const retreivedFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), excludedFiles);
                            filePath = filePath[filePath.length - 1] == '/' ? (filePath + '*') : filePath;
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
                                    this.fileStatus.new.push(fileDetail)
                                }
                            } else {
                                let missedFile ={srcName: basename(filePath) }
                                this.fileStatus.missedFile.push(missedFile)
                            }
                        }
                    }
                }
            }
                await this.clientUtility.updateStatusToServer({ message: 'Analyzed Files', progress: 40 }, 2);
                global.log(this.fileStatus.new.map((file) => file.src), 'New files');
                global.log(this.fileStatus.update.map((file) => file.src), 'Update files');
                global.log(this.fileStatus.noChange.map((file) => file.src), 'No Change files');
                global.log(this.fileStatus.inValid.map((file) => file.src), 'InValid files');
                global.log(this.fileStatus.missedFile.map((file) => file.srcName), 'Missed files');
                global.log(this.fileStatus.missedFileType.map((file) => file.src), 'Missed file types');
                await this.clientUtility.updateStatusToServer({ message: 'Validating Files', progress: 40 }, 2);
                
                if (this.clientUtility.isOut != true) {
                    await this.validate();
                }
                await this.clientUtility.updateStatusToServer({ message: 'Validated Files', progress: 50 }, 2);
                if (this.clientUtility.isOut == false) {
                    if(!this.isServerPath){
                        if(this.tool.fileConfig.filter((list) => list.isS3Upload).length > 0){
                            await this.uploadToS3();
                        }else{
                            await this.uploadFiles();
                        }
                    }
                } else {
                    await this.downloadFiles();
                }
                this.clientUtility.updateFileDetails = true;
               
                //Need to update status to server 
                await this.clientUtility.updateStatusToServer({ message:this.clientUtility.activityDetails.placeHolders.ManuscriptZipName, progress: 52, isManuscript: true }, 2);

                resolve();
            } catch (err) {
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
 
    async fetchDetails(payload) {
        this.fetchPayoadDetails(payload);
        await this.fetchFileDetails();
    }
 
    fetchPayoadDetails(payload) {
        const { activityDetails } = payload;
        this.tool.id = activityDetails.toolId;
        const config = this.clientUtility.activityDetails.toolsConfig;
        const toolConfig = (config['tools'] && config['tools'][this.tool.id]) ? config['tools'][this.tool.id] : {};
        this.tool.fileConfig = toolConfig.files ? toolConfig.files : {};
        this.wf = extendedJoin([this.clientUtility.pathDetails.client.path], false);
        let DOI =  this.clientUtility.activityDetails.placeHolders.DOI ?  this.clientUtility.activityDetails.placeHolders.DOI:''
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]),__DOI__ : DOI? DOI.replaceAll('/','_'): '' };
        // this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]) };
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
            activitymodeltypeflow:this.clientUtility.activityDetails.activitymodeltypeflow,
            issuemstid:this.clientUtility.activityDetails.issuemstid,
            wfDefId:this.clientUtility.activityDetails.wfDefId,
            fileTypeId: this.clientUtility.activityDetails.fileType.id,
            iscamundaflow: this.clientUtility.activityDetails.iscamundaflow,
            isTool: true,
            dmsType: this.clientUtility.activityDetails.dmsType
            

 
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, filesAdditionalInfo, validationFileConfig, fileTypes } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.fileTypes = fileTypes;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
        if(filesAdditionalInfo?.extractedFiles.length > 0){
            // let updatedPayload = filesAdditionalInfo?.extractedFiles.filter(file => (file.fileFlowType || []).filter(x => x.toLocaleLowerCase() === "out").length > 0);
            //  updatedPayload =await this.updateCopyPaths(updatedPayload);
            this.filesInfo.extractedFiles  = filesAdditionalInfo?.extractedFiles
            this.clientUtility.activityDetails.newFileCopyBasePath  =filesAdditionalInfo?.newFileCopyBasePath
        }
    }
 
        /**
     * Checks the mandatory tool success for tool id 564 when isOut is false.
     */
    async checkMandatoryToolSuccess() {
        try {
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const checkToolLatestStatus = await post(
                `${APIConfig.server.getBaseURL()}${APIConfig.server.tools.checkMandatoryToolSuccess}`,
                {
                    wfeventId: this.clientUtility.activityDetails.wfEventId,
                    toolId: this.tool.id
                },
                headers
            );
            this.clientUtility.checkMandatoryToolSuccess = checkToolLatestStatus;
        } catch (error) {
            console.log('Error in checkMandatoryToolSuccess:', error);
        }
    }

    async isValidFile(basePath, path, isRoot, typeId, typeName, files, pageRange) {
        return new Promise(async (resolve, reject) => {
            try {
                if (this.clientUtility.activityDetails.validationFileConfig[typeId]) {
                    let ChapterNumber = typeName.includes('_Chapter') ? typeName.replace('_Chapter',"")  : ""

                    const payload = {
                        validationFiles: this.clientUtility.activityDetails.validationFileConfig[typeId].files || [],
                        file: { path, basePath, isRoot },
                        files: files.map((file) => { return { path: file.path, uuid: file.uuid } }),
                        placeHolders: { ...this.clientUtility.activityDetails.placeHolders, ... { FileTypeName: typeName, PageRange: pageRange, JnlTypeFileTypeName: typeName + this.clientUtility.activityDetails.placeHolders.JnlTypeFileName ,ChapterNumber} },
                        customer: this.clientUtility.activityDetails.customer
                    };
                    // const headers = {
                    //     'Authorization': `Bearer ${config.server.getToken()}`
                    // };
                    // const isValidFile = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.isValidFile}`, payload, headers);
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
 
    async validate() {
        this.validateFile();
        await this.validateZeroFileSize();
        // await this.validateProcess();
    }
 
    async validateProcess() {
        // need to implement
    }
 
    validateFile() {
        const files = [
            ...this.fileStatus.missedFile.map(file => file.srcName),
            ...this.fileStatus.inValid.map(file => `${file.srcName} (File Config Missing)`),
            ...this.fileStatus.missedFileType.map(file => `${file.srcName} (${this.getFileTypeNames(file.typeId)} Type Missing)`)
        ];
        
        const toolConfig = this.clientUtility.activityDetails
        // if (toolConfig.activity.actualactivitycount == 1 && (toolConfig.wfDefId == 775 || toolConfig.wfDefId == 876|| toolConfig.wfDefId == 807 ||toolConfig.wfDefId == 810) && this.tool.id == 48)
        //     throw `Compare not applicabe for first iteration`;
        this.filesInfo.data.forEach(data => {
         //   let datafiles = this.clientUtility.activityDetails.isOtherArticle ? this.clientUtility.activityDetails.validationFileConfig['83'].files:  this.clientUtility.activityDetails.validationFileConfig[data.typeId] ? this.clientUtility.activityDetails.validationFileConfig[data.typeId].files:[]
         let datafiles = this.clientUtility.activityDetails.isOtherArticle
         ? (this.clientUtility.activityDetails.validationFileConfig['83']
             ? this.clientUtility.activityDetails.validationFileConfig['83'].files
             : (this.clientUtility.activityDetails.validationFileConfig['10']
                 ? this.clientUtility.activityDetails.validationFileConfig['10'].files
                 : [])
           )
         : (this.clientUtility.activityDetails.validationFileConfig[data.typeId]
             ? this.clientUtility.activityDetails.validationFileConfig[data.typeId].files
             : []);
         datafiles.forEach(file => {
                    if (file && file.custom && (file.custom.skipTool))
                    if (toolConfig.activity.actualactivitycount == 1  && this.tool.id == file.custom.toolId)
                        throw `Compare not applicabe for first iteration`;
                })
        })
        if (files.length) throw `Following mandatory files are missing.\n ${files.join(', ')} `;
    }
 
    getFileTypeNames(typeId) {
        typeId = typeId instanceof Array ? typeId : [typeId];
        const fileTypeDetail = this.fileTypes.filter(ft => typeId.includes(parseInt(ft.filetypeid)));
        return fileTypeDetail.length ? fileTypeDetail.map(ft => ft.filetype).join(', ') : '';
    }
 
    async validateZeroFileSize() {
        const files = [...this.fileStatus.new, ...this.fileStatus.update];
        let isNotValid = false;
        for (let i = 0; i < files.length; i++) {
            const { src } = files[i];
            const fStat = await stat(src);
            if (fStat.size == 0) {
                isNotValid = true;
                break;
            }
        }
        if (isNotValid) throw 'Zero kb file found. Please upload valid file';
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
        let inputConfig = {}
        let  fileTypes= []
        if (this.clientUtility.isOut == false) {
            inputConfig = this.tool.fileConfig.filter(x=>(x.fileFlowType||[]).includes("IN"));
        } else {
            inputConfig =  this.tool.fileConfig.filter(x=>(x.fileFlowType||[]).includes("OUT"));
        };

        let filteredOtherArticleFiles =[]
        if(this.clientUtility.activityDetails.isOtherArticle){
            var fileDetailsInIncoming = await getIncomingFileTypeDetails(this.clientUtility);
            console.log(fileDetailsInIncoming,"fileDetailsInIncomingfileDetailsInIncomingfileDetailsInIncoming")
            filteredOtherArticleFiles = fileDetailsInIncoming.filter((list)=>list.articletype== 'Other Article')

        }
        if(filteredOtherArticleFiles.length >0){
            filteredOtherArticleFiles.forEach((sublist)=>{
                 fileTypes.push(parseInt(sublist.filetypeid))
            })
        }
        fileTypes = new Set(fileTypes)
        // let inputfile = inputConfig.length >0 && inputConfig[0].fileTypes.length >0 ? inputConfig[0].fileTypes : []
        // let a =[...inputfile,...fileTypes]
        // inputConfig[0].fileTypes = a
        let filteredIndex = inputConfig.filter((list)=> list.fileTypes.includes(83))
        filteredIndex.map((list)=>{
            let inputfile =list.fileTypes.length >0 ? list.fileTypes : []
            let a =[...inputfile,...fileTypes]
            list.fileTypes = a 
        })
     
        const inputKeys = Object.keys(inputConfig);
        for (let i = 0; i < inputKeys.length; i++) {
            const inputKey = inputKeys[i];
            const inputFile = inputConfig[inputKey];
            // const inputFileTypeId = inputFile.typeId instanceof Array ? inputFile.typeId : [inputFile.typeId];
            const inputFileTypeId = inputFile.fileTypes instanceof Array ? inputFile.fileTypes : [inputFile.fileTypes];
            const fTypeName = inputFile.fileTypeName;
            // if (inputFile.isSync == false) continue;
            const skipFileConfig = inputFile.skipFileConfig == true;
            const isIssue = inputFile.isIssue  ? true : false
            const lwfDetails = inputFile.lwf && inputFile.lwf.src ? {
                src: inputFile.lwf.src, isRoot: !!inputFile.lwf.isRoot
            } : { src: '', isRoot: false };
            const formattedFTypeName = fTypeName ? getFormattedName(fTypeName, this.clientUtility.activityDetails.placeHolders) : '';
            const formattedFTypeNameRegex = new RegExp(formattedFTypeName);
            const filteredfileDetails = this.filesInfo.data.filter(fd => {
                const formattedFTypeNameResult = fd.name.match(formattedFTypeNameRegex);
                const isTypeNameMatched = (fTypeName ? (formattedFTypeNameResult ? formattedFTypeNameResult[0] == fd.name : false) : true)
                return inputFileTypeId.includes(parseInt(fd.typeId)) && isTypeNameMatched &&
                    ((this.clientUtility.activityDetails.fileType.fileId && fd.allowSubFileType && !isIssue) ? fd.incomingFileId == this.clientUtility.activityDetails.fileType.fileId : true)
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
                let ChapterNumber = fileTypeName.includes('_Chapter') ? fileTypeName.replace('_Chapter',"")  : ""

                let FileTypeName = fileTypeName ? fileTypeName : ''
                // let piivalue = await this.getFileNameForPii({ workOrderId: this.clientUtility.activityDetails.workOrderId, fileName :FileTypeName  })
                // piivalue = piivalue != '' ? piivalue : ''
                let articletype = ((this.clientUtility.activityDetails.placeHolders.ArticleTypeList || []).filter(x => x.FileTypeName == FileTypeName).pop() || {}).articletype;
                const piivalue = (
                    (this.clientUtility.activityDetails.placeHolders.ArticleTypeList || [])
                      .filter(x => x.FileTypeName == FileTypeName)
                      .pop() || {}
                  ).piinumber;
 
                this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, JnlTypeFileTypeName:JnlTypeFileTypeName  , articletype : articletype,IssuePII : piivalue,ChapterNumber}
 
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
                    }
                    else {
                        fileValidationStatus = await this.isValidFile(basePath, path, isRootFile, typeId, fileTypeName, files, pageRange);
                    }
                    const dest = dirname(fileValidationStatus.lwfDetails && fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) == '.' ? '' : dirname(fileValidationStatus.lwfDetails.src ? fileValidationStatus.lwfDetails.name : path) + '/';
                    const fileDetail = {
                        inputKey, src: srcFile, relativeSrc, srcName: fileValidationStatus.lwfDetails && fileValidationStatus.lwfDetails.src ? basename(fileValidationStatus.lwfDetails.name) : srcFileName,
                        dest: basePath + dest, typeId, fileId: incomingFileId
                    };
                    // if (fileValidationStatus.isValid) {
                    //     if (fileValidationStatus.isAlreadyExist && fileValidationStatus.existedFileInfo && fileValidationStatus.existedFileInfo.uuid) {
                    //         const existedFile = files.find((file) => file.path == (fileValidationStatus.existedFileInfo.path ||  fileValidationStatus.existedFileInfo.name));
                    //         let srcChecksum = undefined;
                    //         let okmChecksum = undefined;
                    //         let awt = [];
                    //         awt.push(getChecksum(srcFile).then(val => { srcChecksum = val; }).catch(err => { }));
                    //         switch (this.clientUtility.activityDetails.dmsType) {
                    //             case "azure":
                    //                 awt.push(azureHelper.getChecksum(existedFile.path).then(val => { okmChecksum = val; }).catch(err => { }));
                    //                 break;                            
                    //             default:
                    //                 awt.push(okmHelper.getChecksum(existedFile.uuid).then(val => { okmChecksum = val; }).catch(err => { }));
                    //                 break;
                    //         }
                    //         await Promise.all(awt);
                    //         if (srcChecksum == okmChecksum && srcChecksum && okmChecksum) {
                    //             this.fileStatus.noChange.push({ ...fileDetail, destUUID: existedFile.uuid, actFileMapId: existedFile.actfilemapid });
                    //         } else {
                    //             this.fileStatus.update.push({ ...fileDetail, destUUID: existedFile.uuid, actFileMapId: existedFile.actfilemapid });
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
                await this.clientUtility.updateStatusToServer({ message: 'Uploading Files', progress: 50 }, 2);
                //let pathToDelete = [this.filesInfo.data[0].basePath]//[...new Set(files.map(ele => ele.dest))];
                //for (let index = 0; index < pathToDelete.length; index++) {
                let pth =''
                if(this.clientUtility.activityDetails.iscamundaflow){
                 pth = this.filesInfo.data[0].basePath + `tool/${this.tool.id}/In/`
                }else{
                    pth = this.clientUtility.activityDetails.newFileCopyBasePath  + `tool/${this.tool.id}/In/`

                }
                let awat = [];
                let allFiles = [];
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        allFiles = await getRetreiveBlobFilesURL(pth)
                        for (let i = 0; i < allFiles.length; i++) {
                            let filePath = allFiles[i].path
                            awat.push(azureHelper.deleteFile(filePath));
                        }
                        break;
                    case "local":
                        if (this.clientUtility.activityDetails.activitymodeltypeflow !== 'Batch') {
                            allFiles = await localHelper.getRetreivelocalFilesURL(pth)
                            for (let i = 0; i < allFiles.length; i++) {
                                let filePath = allFiles[i].path
                                awat.push(localHelper.deletelocalFile(filePath));
                            }
                        }
                        break;
                    default:
                        break;
                }
                // let allFiles = await getRetreiveBlobFilesURL(pth)
                // let awat = [];
                // for (let i = 0; i < allFiles.length; i++) {
                //     let filePath = allFiles[i].path
                //     awat.push(azureHelper.deleteFile(filePath));
                // }
                await Promise.all(awat);
                //}
 
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (this.filesInfo.data.length > 1){
                        if(this.clientUtility.activityDetails.woType == 'Book' && file.dest.endsWith('page_target/')){
                            let fileData=  this.filesInfo.data.filter((list) => list.typeId == file.typeId)
                              file.dest = fileData[0].basePath + `tool/${this.tool.id}/In/` + file.dest.replace(fileData[0].basePath, '');
                          }else{
                              file.dest = file.dest + `tool/${this.tool.id}/In/`;
                          }
                    }
                    else
                    if(this.clientUtility.activityDetails.iscamundaflow){
                        file.dest = this.filesInfo.data[0].basePath + `tool/${this.tool.id}/In/` + file.dest.replace(this.filesInfo.data[0].basePath, '');
                       }else{
                            file.dest = this.clientUtility.activityDetails.newFileCopyBasePath  + `tool/${this.tool.id}/In/`                     
                       }
                    await this.updateUploadProgressDetails(file, progressDetails, true);
                    await this.uploadNewFile(file, true);
                    await this.updateUploadProgressDetails(file, progressDetails, false);
 
                }
 
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }
 
    async downloadFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.clientUtility.updateStatusToServer({ message: 'Downloading Files', progress: 50 }, 2);
                if(this.clientUtility.activityDetails.iscamundaflow){
                for(let j=0;j<this.filesInfo.data.length;j++){
                this.blobPath = this.filesInfo.data[j].basePath + `tool/${this.tool.id}/Out/`;
                let RetreiveBlobFilesURLs = [];
                let awt = [];
                let awat = [];
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(this.blobPath);
                        for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                            const element = RetreiveBlobFilesURLs[index].path;
                            let BlobPath = (element.includes(this.blobPath)) ? element.replace(this.blobPath, "") : element;
                            let LocalPath = join(this.wf, BlobPath);
                            this.checkDirectorySync(dirname(LocalPath));
                            awt.push(httpDownload({ "path": RetreiveBlobFilesURLs[index].downloadPath }, dirname(LocalPath), basename(LocalPath)).then(async () => {
                               await this.clientUtility.updateStatusToServer({ message: `${basename(LocalPath)} copied.`, progress: j }, 2);
                            }));
                        }
                        await Promise.all(awt);
                        RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(this.filesInfo.data[j].basePath + `tool/${this.tool.id}`);
                        for (let i = 0; i < RetreiveBlobFilesURLs.length; i++) {
                            let filePath = RetreiveBlobFilesURLs[i].path
                            awat.push(azureHelper.deleteFile(filePath));
                        }
                        await Promise.all(awat);
                        break;
                    case "local":
                       RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(this.blobPath);
                       for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                            const element = RetreiveBlobFilesURLs[index].path;
                            let BlobPath = (element.includes(this.blobPath)) ? element.replace(this.blobPath, "") : element;
                            let LocalPath = join(this.wf, BlobPath);
                            this.checkDirectorySync(dirname(LocalPath));
                            awt.push(localHelper.downloadlocalFile(RetreiveBlobFilesURLs[index].path, dirname(LocalPath), basename(LocalPath)).then(async () => {
                                await this.clientUtility.updateStatusToServer({ message: `${basename(LocalPath)} copied.`, progress: j }, 2);
                            }));
                        }
                        await Promise.all(awt);
                        RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(this.filesInfo.data[j].basePath + `tool/${this.tool.id}`);
                        for (let i = 0; i < RetreiveBlobFilesURLs.length; i++) {
                            let filePath = RetreiveBlobFilesURLs[i].path
                            awat.push(localHelper.deletelocalFile(filePath));
                        }
                        await Promise.all(awat);
                        break;
                    default:
                        break;
                }
            }
        }else{
            if(this.fileStatus.new.length >=1){
                let RetreiveBlobFilesURLs = [];
                let awt = [];
                let awat = [];
                this.blobPath = this.clientUtility.activityDetails.newFileCopyBasePath + `tool/${this.tool.id}/Out/`;
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(this.blobPath);
                        for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                            const element = RetreiveBlobFilesURLs[index].path;
                            let BlobPath = (element.includes(this.blobPath)) ? element.replace(this.blobPath, "") : element;
                            let LocalPath = join(this.wf, BlobPath);
                            this.checkDirectorySync(dirname(LocalPath));
                            awt.push(httpDownload({ "path": RetreiveBlobFilesURLs[index].downloadPath }, dirname(LocalPath), basename(LocalPath)).then(async () => {
                               await this.clientUtility.updateStatusToServer({ message: `${basename(LocalPath)} copied.`, progress: j }, 2);
                            }));
                        }
                        await Promise.all(awt);
                        RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(this.clientUtility.activityDetails.newFileCopyBasePath+ `tool/${this.tool.id}`);
                        for (let i = 0; i < RetreiveBlobFilesURLs.length; i++) {
                            let filePath = RetreiveBlobFilesURLs[i].path
                            awat.push(azureHelper.deleteFile(filePath));
                        }
                        await Promise.all(awat);
                        break;
                    case "local":
                       RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(this.blobPath);
                       for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                            const element = RetreiveBlobFilesURLs[index].path;
                            let BlobPath = (element.includes(this.blobPath)) ? element.replace(this.blobPath, "") : element;
                            let LocalPath = join(this.wf, BlobPath);
                            this.checkDirectorySync(dirname(LocalPath));
                            awt.push(localHelper.downloadlocalFile(RetreiveBlobFilesURLs[index].path, dirname(LocalPath), basename(LocalPath)).then(async () => {
                                await this.clientUtility.updateStatusToServer({ message: `${basename(LocalPath)} copied.`, progress: 1 }, 2);
                            }));
                        }
                        await Promise.all(awt);
                    // Delete file with  from LocalPath if checkMandatoryToolSuccess is true
                    if (this.clientUtility?.checkMandatoryToolSuccess === true) {
                          const filesToDelete = this.clientUtility.activityDetails.toolsConfig.tools[this.tool.id].files
                        .filter(file => file.DeleteOnSuccess === true)
                        .map(file => file.name);// AI code from co-pilot
                        for (let index = 0; index < filesToDelete.length; index++) {
                            const element = filesToDelete[index];
                            let BlobPath = (element.includes(this.blobPath)) ? element.replace(this.blobPath, "") : element;
                            let valueblobpath = BlobPath.includes('/') ? basename(BlobPath.split('/')[0]) : BlobPath;
                            let LocalPath = join(this.wf, valueblobpath);
                            try {
                                if (existsSync(LocalPath)) {
                                    if (lstatSync(LocalPath).isDirectory()) {
                                        rmSync(LocalPath, { recursive: true, force: true });
                                    } else {
                                        unlinkSync(LocalPath);
                                    }
                                }
                            } catch (e) {
                                // Ignore error if file does not exist or cannot be deleted
                            }
                        }
                    }
                        RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(this.clientUtility.activityDetails.newFileCopyBasePath+ `tool/${this.tool.id}`);
                        for (let i = 0; i < RetreiveBlobFilesURLs.length; i++) {
                            let filePath = RetreiveBlobFilesURLs[i].path
                            awat.push(localHelper.deletelocalFile(filePath));
                        }
                        await Promise.all(awat);
                        break;
                    default:
                        break;
                }
            }
          
        }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }
 
    checkDirectorySync(directory) {
        try {
            statSync(directory);
        } catch (e) {
            mkdirSync(directory, { recursive: true });
        }
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
        const { src, destUUID, actFileMapId, dest, srcName } = file;
        const fileName = basename(srcName);
        const okmDest = dest.replace(new RegExp(/\\/, 'g'), '/');
        switch (this.clientUtility.activityDetails.dmsType) {
            case "azure":
                await azureHelper.uploadExistingFile(src, `${okmDest}${fileName}`)
                break;
            case "local":
                if(os.platform() == "win32" && isInternalConnection){
                    await localHelper.uploadlocalExistingFileWithImpersonator(src, `${okmDest}${fileName}`)
                }
                else{
                    await localHelper.uploadlocalExistingFile(src, `${okmDest}${fileName}`)
                }
                break;
            default:
                await okmHelper.uploadExistingFile(src, destUUID);
                break;
        }
        // await this.updateExistingFileDetails(actFileMapId);
        // await this.updateFileSyncStatus();
        global.log(`${src} updated`);
    }
    async uploadNewFile(file, isToolsupload=false) {
        const { src, srcName, dest, fileId } = file;
        const okmDest = dest.replace(new RegExp(/\\/, 'g'), '/');
        switch (this.clientUtility.activityDetails.dmsType) {
            case "azure":
                await azureHelper.uploadNewFile(src, okmDest, srcName);
                break;
            case "local":
                if(os.platform() == "win32" && isInternalConnection){
                    await localHelper.uploadlocalNewFileWithImpersonator(src, okmDest, srcName, this.clientUtility);
                }else{
                    await localHelper.uploadlocalNewFile(src, okmDest, srcName);
                }
                //AI- Revalidate the uploaded file
                // Retry logic: try up to 3 times with 5 seconds delay if file does not exist
             if(isToolsupload){
                let retries = 2;
                let validated = false;
                while (retries > 0 && !validated) {
                    try {
                        const result = await localHelper.validateUploadedFile(src, okmDest, srcName);
                        if (result.success === true) {
                            validated = true;
                        } else {
                            retries--;
                            if (retries > 0) {
                                await new Promise(res => setTimeout(res, 5000));
                            } else {
                                throw new Error('Uploaded file does not exist. Please retry the process.');
                            }
                        }
                    } catch (err) {
                        retries--;
                        if (retries > 0) {
                            await new Promise(res => setTimeout(res, 5000));
                        } else {
                            throw err;
                        }
                    }
                }
            }
                break;
            default:
                break;
        }
        // await azureHelper.uploadNewFile(src, okmDest, srcName);
        //const fileName = basename(srcName);
        //let out = {};
        // switch (this.clientUtility.activityDetails.dmsType) {
        //     case "azure":
        //out = await azureHelper.uploadNewFile(src,okmDest,srcName);
        //         break;        
        //     default:
        //         await okmHelper.deleteFile(okmDest + fileName);
        //         out = await okmHelper.uploadNewFile(src, okmDest, srcName);
        //         break;
        // }
        //const { uuid, path } = out;
        // await this.updateNewFileDetails(uuid, path, fileId);
        // await this.updateFileSyncStatus();
        //global.log(`${src} added`);
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
    async updateCopyPaths(payloads) {
        return payloads.map(payload => ({
          ...payload,
          copyPaths: payload.copyPaths.map(path => ({
            sourcepath: path.sourcepath.replace(/\//g, '\\'),
            destpath: path.destpath.replace(/\//g, '\\')
          }))
        }));
      }

      async uploadToS3() {
        return new Promise(async (resolve, reject) => {
            let logHistoryPayload ={
                request: '',
                response: '',
                message: '',
                status: '',
                processStatusId: 0,
            }
            try {
                let inputConfig = this.tool.fileConfig.filter((list) => list.isS3Upload);
    
                // Format file names using placeholders
                inputConfig.forEach((list) => {
                    list.name = getFormattedName(list.name, this.clientUtility.activityDetails.placeHolders);
                });
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);

                //need to construct here for audit entry
                logHistoryPayload.request =folderStructureWithRoot
                logHistoryPayload.response =inputConfig
                logHistoryPayload.message ='Final package upload process started'
                logHistoryPayload.status ='Started'
                logHistoryPayload.processStatusId =1

                 const s3Info = await getS3UploadDetails(this.clientUtility.activityDetails.workOrderId,logHistoryPayload)
                 console.log(s3Info, 's3Info')

                AWS.config.update({
                    accessKeyId:s3Info?.data?.accessKeyId,
                    secretAccessKey:s3Info?.data?.secretAccessKey,
                    region:s3Info?.data?.region,
                  });
                  
                  const s3 = new AWS.S3();
    
                for (let i = 0; i < inputConfig.length; i++) {
                    let inputFile = inputConfig[i];
                    let filePath = extendedJoin([folderStructureWithRoot, inputFile.name ]).replace(new RegExp(/\\/, 'g'), '/');
                     const localFolderName = basename(filePath)
                    const srcFiles = await retreiveLocalFiles(extendedJoin([filePath, '**', '*']));
                    // const srcFiles = micromatch(retrievedFiles, filePath).map(file => extendedJoin([file]));
                    
                    console.log(srcFiles, 'src files');
                    
                    let fileDetails = [];
                    for (const file of srcFiles) {
                        // Read file content
                        const fileContent = readFileSync(file);
    
                        // Set up S3 upload parameters
                        const params = {
                            Bucket:`${s3Info.data.bucket}/${this.clientUtility.activityDetails.placeHolders.PII}`,
                            Key:basename(file),
                            Body: fileContent,
                            ACL: 'bucket-owner-full-control'
                        };
    
                        // Upload file to S3
                        const data = await s3.putObject(params).promise();
                        console.log('File uploaded successfully:', data);
    
                        // Fetch file size after upload
                        const headParams = {
                            Bucket: params.Bucket,
                            Key: params.Key  
                        };
                        let url = `${s3Info.data.awsUrl}/${s3Info.data.bucket}/${this.clientUtility.activityDetails.placeHolders.PII}/${params.Key}`;
                        const headData = await s3.headObject(headParams).promise();
                        console.log('File size after upload:', headData.ContentLength, 'bytes');
    
                        // Collect file details
                        fileDetails.push({
                            path:url,
                            etag: data.ETag,
                            size: headData.ContentLength
                        });
                    }
    
                    // Write file details to a JSON file
                    if(fileDetails && fileDetails.length > 0){
                        writeFileSync(`${this.clientUtility.pathDetails.client.path}/${localFolderName}_filedetails.json`, JSON.stringify(fileDetails));
                        const payload ={
                            destPath : this.clientUtility.activityDetails.newFileCopyBasePath  + `tool/${this.tool.id}/Out/${localFolderName}_filedetails.json`,
                            inputJson:JSON.stringify(fileDetails)
                        }
                        await localHelper.localCheckinJson(payload)

                        // if (!isPathExist(this.clientUtility.activityDetails.newFileCopyBasePath  + `tool/${this.tool.id}/Out/`)) await makeDir(this.clientUtility.activityDetails.newFileCopyBasePath  + `tool/${this.tool.id}/Out/`);
                        // writeFileSync(this.clientUtility.activityDetails.newFileCopyBasePath  + `tool/${this.tool.id}/Out/${localFolderName}_filedetails.json`, JSON.stringify(fileDetails));
                    }else{
                        reject('S3 file upload failed, input folder missing');
                    }
                    logHistoryPayload.request =srcFiles
                    logHistoryPayload.response =fileDetails
                    logHistoryPayload.message ='Final package upload process completed'
                    logHistoryPayload.status ='Completed'
                    logHistoryPayload.processStatusId =3
                    await getS3UploadDetails(this.clientUtility.activityDetails.workOrderId,logHistoryPayload)
                }
    
                resolve();
            } catch (err) {
                logHistoryPayload.request =err
                logHistoryPayload.response ='S3 upload failed'
                logHistoryPayload.message ='Final package upload failed'
                logHistoryPayload.status ='Failed'
                logHistoryPayload.processStatusId =4
                await getS3UploadDetails(this.clientUtility.activityDetails.workOrderId,logHistoryPayload)
                reject(err);
            }
        });
    }
    
};
 
class ShareFilesync {
 
    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }
 
    async startProcess(payload) {
        return new Promise(async (resove, reject) => {
            try {
                console.log(payload)
                //  let { uuID, name, path } = payload.activityDetails
                let { filepath, id } = payload.path
                filepath=  payload?.activityId =='170' ? join(filepath,'Print','\\') : filepath
                let destFilepath
                // let postSrcFiles
                if (id == 'fromSave') {
                    //   let objKeys = Object.keys(payload.retreiveOKMFiless);
                    //  console.log(objKeys, 'poip')
                    let size = 5; var arrayOfArrays = [];
 
                    for (var i = 0; i < payload.newUploadedImages.length; i += size) {
                        arrayOfArrays.push(payload.newUploadedImages.slice(i, i + size));
                    }
                    for (let index = 0; index < arrayOfArrays.length; index++) {
                        const element = arrayOfArrays[index];
                        let awt = [];
                        for (let ind = 0; ind < element.length; ind++) {
                            let value = element[ind];
                            // destFilepath = join(
                            //     filepath,
                            //     basename(value.originalPath)
                            //         .replace(" ", "")
                            //         .replace("- ", "-")
                            //         .replace(" -", "-")
                            // );
                                 destFilepath = 
                                filepath +
                                basename(value.originalPath)
                                    .replace(" ", "")
                                    .replace("- ", "-")
                                    .replace(" -", "-")
                            
                            if(value && value.name.includes('_Online')){
                                let fileName =value.name.replace('_Online', '_Print')
                                destFilepath =join(filepath,fileName);
                            }else if(value && value.name.includes('_Print')){
                                let fileName =value.name
                                if(this.clientUtility.activityDetails.customer.id == 13 && this.clientUtility.activityDetails.activity.id == 101){
                                    fileName =value.name.replace('_Print', '')
                                }
                              let convertPath =join(filepath, 'Print')
                                destFilepath =join(convertPath,fileName);
                            }else{
                                destFilepath = destFilepath
                            }
                            let postFiles = [];
                            postFiles.push({
                                src: value.originalPath,
                                dest: destFilepath,
                            });
                            global.clientUtility = this.clientUtility;
                            awt.push(copyIOFilesWithImpersonator(postFiles, false));
                        }
                        await Promise.all(awt);
                    }
                } else {
                    let postSrcFiles
                    let { uuID, name, path } = payload.activityDetails
                    let { fileName } = payload.path
                    switch (this.clientUtility.activityDetails.dmsType) {
                        case "azure":
                            postSrcFiles = await azureHelper.downloadFileURL(path);
                            break;
                        case "local":
                            postSrcFiles = await localHelper.downloadlocalFileURL(path);
                            break;
                        default:
                            postSrcFiles = `${APIConfig.okm.getBaseURL()}${APIConfig.okm.document.download}/${uuID}`;;
                            break;
                    }
                    destFilepath = join(filepath, fileName);
                    let postFiles = []
                    postFiles.push({
                        "src": postSrcFiles,
                        "dest": destFilepath
                    })
                    global.clientUtility = this.clientUtility
                    await copyIOFilesWithImpersonator(postFiles, false);
                }
                resove(this.clientUtility.activityDetails.placeHolders);
            } catch (error) {
                reject(error);
            }
        })
    };
}
 
 
module.exports = {
    SyncToolsFile, ShareFilesync
};