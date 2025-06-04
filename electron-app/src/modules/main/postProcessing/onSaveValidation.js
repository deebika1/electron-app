const { APIConfig } = require('../../../config/api');
const { config } = require('../../../config/index');
const { post } = require('../../../modules/http/index');
const { execute, executeOutputFileValidation } = require('../../utils/process');
const { getParamsValue, getParamsPair, getFormattedParams, getFormattedName, readSmallFile, isPathExist, retreiveLocalFiles, readDir, readdirSync, statSync, getFileTypeFolderStructure, extendedJoin, uploadS3Payload ,checkToolSuccess} = require('../../utils/io');
const { extname, join, basename } = require('path');
const copyFiles = require('../copyFiles');
const { onServiceTools, getToolDetails } = require('../serviceTool');
const fs = require('fs');
const micromatch = require('micromatch');
const libre = require("libreoffice-convert");
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdf2json = require('pdf2json');
// const pdfParse = require('pdf-parse');



const fetchToolDetail = async (tool) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payload = {
                toolId: tool.id,
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const { apiconfig, tooltypeid, tooloutputid } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getToolDetail}`, payload, headers);
            const actParams = tool.config.params ? tool.config.params : [];
            const mstParams = apiconfig && apiconfig.params ? apiconfig.params : tool.params;
            const Actualparams = [...getParamsPair(mstParams), ...getParamsPair(actParams)];
            tool.params = Actualparams;
            tool.path = apiconfig && apiconfig.path ? apiconfig.path : '';
            tool.dependentFiles = apiconfig && apiconfig.dependentFiles ? apiconfig.dependentFiles : [];
            tool.toolTypeId = tooltypeid ? tooltypeid : '';
            tool.toolOutputId = tooloutputid ? tooloutputid : '';
            resolve(tool)
        }
        catch (e) {
            console.log('tool fetch details error for on save', e)
            reject(e)
        }
    })
}

const getIncomingFileTypeDetails = (clientUtility) => {
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

const processInputParams = async (toolData, clientUtility, filesInfo, fileTypeDetails) => {
    return new Promise(async (resolve, reject) => {
        try {
            let inputFileStatus = await fetchToolsFileDetails(toolData.config.files.input, clientUtility, filesInfo);
            validateFile(clientUtility, inputFileStatus, fileTypeDetails);
            var Additionalparams = inputFileStatus.params;
            resolve(Additionalparams)
        }
        catch (e) {
            global.log('error in fetching incoming file details')
            reject(e)
        }
    })
}

const validateFile = (clientUtility, fileStatus, fileTypeDetails) => {
    console.log(clientUtility, "clientUtility")
    if (fileStatus && fileStatus.missedFileType && fileStatus.missedFileType.length > 0) {
        for (var i = 0; i < fileStatus.missedFileType.length; i++) {
            var filteredResult = fileTypeDetails.filter((list) => list.filetypeid == fileStatus.missedFileType[i].typeId)
            if (filteredResult && filteredResult.length > 0) {
                clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, ... { FileTypeName: filteredResult[0].filename, PageRange: filteredResult[0].newfilename } }
                fileStatus.missedFileType[i].srcName = getFormattedName(fileStatus.missedFileType[i].srcName, clientUtility.activityDetails.placeHolders);
            }

        }
    }

    const files = [
        ...fileStatus.missedFile.map(file => file.srcName),
        ...fileStatus.missedFileType.map(file => `${file.srcName} (${getFileTypeNames(file.typeId, fileTypeDetails)} Type Missing)`)
    ];
    if (files.length) throw `Following mandatory files are missing.\n ${files.join(', ')} `;
}


const getFileTypeNames = (typeId, fileTypeDetails) => {

    typeId = typeId instanceof Array ? typeId : [typeId];
    const fileTypeDetail = fileTypeDetails.filter(ft => typeId.includes(parseInt(ft.filetypeid)));
    return fileTypeDetail.length ? fileTypeDetail.map(ft => ft.filetype).join(', ') : '';
}
const fetchToolsFileDetails = async (io, clientUtility, filesInfo) => {
    return await copyFiles.fetchFileCopyDetails(io, clientUtility, filesInfo.data);
}

function GetAllFiles(Dir) {
    return new Promise((resolve, reject) => {
        let Files = [];
        let ThroughDirectory = (Directory) => {
            readdirSync(Directory).forEach(File => {
                const Absolute = join(Directory, File);
                if (statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute);
                else return Files.push(Absolute);
            });
        }
        ThroughDirectory(Dir);
        resolve(Files);
    });
}

const copyToolsDependentFiles = async (tool, clientUtility, filesInfo) => {
    clientUtility.toolId = tool.id;
    const fileStatus = await copyFiles.fetchFileCopyDetails(tool.dependentFiles, clientUtility, filesInfo.data);
    const os = require('os');
    global.clientUtility = this.clientUtility
    if (os.platform() == "win32" && this.software && this.software.detail && this.software.detail.isAdminCopy) {
        await copyFiles.copyIOFilesWithImpersonator(fileStatus.files, true);
    }
    else {
        await copyFiles.copyIOFiles(fileStatus.files, true);
    }
}


const onSaveValidationForTools = async (clientUtility, payload, toolsDetails, filesInfo, action) => {
    return new Promise(async (resolve, reject) => {
        try {
            var tool = {
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
            tool.id = toolsDetails.toolId;
            const toolApId = await createAPI(tool.id, clientUtility)
            if (clientUtility.activityDetails.toolsConfig.tools[toolsDetails.toolId] === undefined) {
                throw new Error("Tool not mapped properly. Contact WMS Admin.")
            }
            const config = clientUtility.activityDetails.toolsConfig.tools && toolsDetails.toolId ? clientUtility.activityDetails.toolsConfig.tools[toolsDetails.toolId] : clientUtility.activityDetails.toolsConfig;
            tool.config = config;
            tool.config.files.input = tool.config.files.filter(x => x.fileFlowType.includes("IN"))
            tool.config.files.output = tool.config.files.filter(x => x.fileFlowType.includes("OUT"))
            // const toolConfig = clientUtility.activityDetails.toolsConfig.tools[tool.id];
            tool.runAsSoftware = !!tool.runAsSoftware;
            tool.fileConfig.input = tool.config.files.filter(x => x.fileFlowType.includes("IN"))
            tool.fileConfig.output = tool.config.files.filter(x => x.fileFlowType.includes("OUT"))
            var toolsDetails2 = await fetchToolDetail(tool)
            console.log(toolsDetails2, "tooolls detail")
            let output = {
                isSuccess: false,
                msg: ''
            }
            var fileTypeDetails = await getIncomingFileTypeDetails(clientUtility);
            console.log(fileTypeDetails, "fileTypeDetails")
            await copyToolsDependentFiles(tool, clientUtility, filesInfo)
            if(clientUtility.activityDetails.iscamundaflow){
                var addParams = await processInputParams(tool, clientUtility, filesInfo, fileTypeDetails);
            for (var i = 0; i < addParams.length > 0; i++) {
                if (addParams[i].weightage == 2 && action == 'save') {
                    addParams[i].value = '0'
                }
            }
            tool.params = addParams
        }else{
                let file = tool.fileConfig.input[0];
                let params = tool.fileConfig.input.params || 
                             clientUtility.activityDetails.toolsConfig.tools[clientUtility.activityDetails.selectedTool]?.params;
                let isFile =params.filter(a => a.includes('FILE')).length? true:false
                let srcName = getFormattedName(file.name, clientUtility.activityDetails.placeHolders);
                params = getParamsPair(params);
                InputParams = params ? params.map(param =>
                    getFormattedParams(param, {
                        ...clientUtility.activityDetails.placeHolders,
                        __FILE__: extendedJoin([clientUtility.activityDetails.placeHolders.__WF__, srcName])
                    })
                ) : [];
            
            if (isFile) {

                let filepath = extendedJoin([clientUtility.activityDetails.placeHolders.__WF__, srcName]).replace(new RegExp(/\\/, 'g'), '/');
                let localFolder = await retreiveLocalFiles(extendedJoin([clientUtility.activityDetails.placeHolders.__WF__, '**', '*']));
                const srcFiles = micromatch(localFolder, filepath).map(file => extendedJoin([file]));
                if (srcFiles.length > 0 || isPathExist(filepath)) {
                    tool.params = InputParams.reduce((acc, curr) => acc.concat(curr), []);
                    console.log(tool.params)
                } else {
                    throw `Mandatory tool Input file ${srcName} missing in working folder`
                }
            }else{
                tool.params =  InputParams.reduce((acc, curr) => acc.concat(curr), []);
                console.log(tool.params)
            }
            
        }
            var formattedNames = getFormattedParams(tool.params, clientUtility.activityDetails.placeHolders);
            const params = getParamsValue(formattedNames);

            output.isSuccess = true;
            await updateAPI(toolApId, { path: tool.path, params })
            var Output1;
            Output1 = await execute(tool.path, params);
            output.msg = Output1.Message
            if (payload.invokePayload.tooloutputid)
                // await executeOutputFileValidation(tool, clientUtility, filesInfo, successMsg, errorMsg, fileTypeDetails)
                var lwfpath = clientUtility.pathDetails.client.path;
                if(tool.fileConfig["input"].filter((list) => list.isS3Upload).length > 0){  
                    let payload = {
                        activityId :clientUtility.activityDetails.activity.id,
                        activityIteration :clientUtility.activityDetails.activity.actualactivitycount,
                        toolId : toolsDetails.toolId,
                        stageId:clientUtility.activityDetails.stage.id,
                        wfeventId: clientUtility.activityDetails.wfEventId,
                        workOrderId: clientUtility.activityDetails.workOrderId
                    }
                    let isToolSuccess = await checkToolSuccess(payload)         
                    if(isToolSuccess?.status){
                        let payloadRes= await uploadS3Payload(clientUtility, tool.fileConfig["input"])
                        console.log(payloadRes)
                        if(!payloadRes.status){
                            reject(payloadRes)
                        }
                    }else{
                        output.msg = 'The payload signal has already been sent successfully.'
                    }    
                }
            await completeAPI(toolApId, output, payload, clientUtility);
            if (isPathExist(lwfpath)) {
                var errorOccures = []
                let payloads = payload;
                if (payload.invokePayload.tooloutputid == 3) {
                    if (Output1.Message == 'Skull available in the PDF') {
                        throw `On save tool validation failed,${Output1.Message}`
                    } else {
                        resolve(output)
                    }
                } else {
                    if (Object.keys(payload.invokePayload.toolvalidation).length > 0) {
                        let toolval = Array.isArray(payload.invokePayload.toolvalidation) ? payload.invokePayload.toolvalidation : [payload.invokePayload.toolvalidation]
                        const dirPaths = await GetAllFiles(lwfpath)
                        for (let j = 0; j < dirPaths.length; j++) {
                            for (var i = 0; i < toolval.length; i++) {
                                var CheckfileName = toolval[i].ValidateFile;
                                var placeHolders = { "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode : clientUtility.activityDetails.placeHolders.FileTypeName }
                                var Checkfile = getFormattedName(CheckfileName, placeHolders)
                                var checkErrorContent = toolval[i].errContent
                                if (dirPaths[j].includes(Checkfile)) {
                                    var fileContent = await readSmallFile(dirPaths[j]);
                                    if (fileContent.includes(checkErrorContent)) {
                                        if (errorOccures.filter(x => x.filename == basename(dirPaths[j])).length == 0)
                                            errorOccures.push({ checkErrorContent: checkErrorContent, filename: basename(dirPaths[j]) })
                                    }
                                }
                            }
                        }
                        if (errorOccures.length > 0) {
                            resolve(output);
                        } else {
                            const err = toolval[0] && toolval[0].errMessage ? `Onsave validation failed. ${toolval[0].errMessage}` : `On save tool validation failed.`;
                            throw (err);
                        }

                    }
                    else if (Output1 && toolsDetails.error_msg && Output1.Message == toolsDetails.error_msg) {
                        throw (toolsDetails.error_msg)
                    } else {
                        resolve(output);

                    }
                }
            }
            resolve(output)

        }
        catch (e) {
            global.log(`On Save-onSaveValidationForTools toolid ${toolsDetails.toolId} process started ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
            if (typeof e === "string") {
                reject({ message: e, toolId: toolsDetails.toolId });
            } else {
                e.toolId = toolsDetails.toolId;
                reject(e);
            }
        }
    })
}
const createAPI = async (onsaveToolId, clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payload = {
                toolsId: onsaveToolId,
                wfeventId: clientUtility.activityDetails.wfEventId,
                isForegroundService: true,
                userId: this.userId,
                actualActivityCount: clientUtility.activityDetails.activity.actualactivitycount

            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            toolApiId = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.createAPIRequestId}`, payload, headers);
            resolve(toolApiId);
        }
        catch (e) {
            reject(e);
        }

    })
}

const updateAPI = async (apiId, params) => {
    const payload = {
        apiId: apiId,
        inputParams: { params }
    };
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.updateAPIRequestId}`, payload, headers);
}

const completeAPI = async (apiId, output, toolsConfig, clientUtility) => {
    const payload = {
        apiId: apiId,
        status: output.isSuccess ? 'Success' : 'Failure',
        remarks: output.msg ? output.msg.toString() : '',
        response: {},
        onSave:toolsConfig?.action == 'save'? true:false,
        sId: clientUtility.sid,
        tooloutputid: toolsConfig.invokePayload.tooloutputid,
        isFileAvailable: false,
        actualActivityCount: clientUtility.activityDetails.activity.actualactivitycount
    };
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.completeAPIRequestId}`, payload, headers);
}

const onSaveValidationForServiceTools = async (clientUtility, payload, toolsDetails, filesInfo, action) => {
    return await new Promise(async (resolve, reject) => {
        try {
            global.log(`On Save onSaveValidationForServiceTools toolid ${toolsDetails.toolId} process started ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
            var onSaveServiceTool = await onServiceTools(clientUtility, payload, toolsDetails.toolId);
            global.log(`On Save onSaveValidationForServiceTools toolid ${toolsDetails.toolId} process completed ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
            resolve(onSaveServiceTool, "On Save Validation Success");
        } catch (er) {
            global.log(`On Save onSaveValidationForServiceTools toolid ${toolsDetails.toolId} process error : ${er} ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
            reject(er)
        }
    });
}
const checkGraphicEnabled = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payload = {
                workorderId: clientUtility.activityDetails.workOrderId,
                wfeventId: clientUtility.activityDetails.wfEventId,
                woincomingFileId: clientUtility.activityDetails.fileType.fileId ? clientUtility.activityDetails.fileType.fileId : null,
                taskType: clientUtility.activityDetails.instanceType
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()} `
            };
            const checkGraphicEnabled = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.checkGraphicEnabled} `, payload, headers);
            resolve(checkGraphicEnabled);

        }
        catch (e) {
            global.log(e, 'checkGraphicEnabled error');
            reject(e);
        }
    });
}

//this function used to upload zip file sftp in packagecreation
// const uploadziptoSFTP = (clientUtility,files,saveFilesToFtp) =>{
//     return new Promise(async (resolve,reject) =>{
//         try {

//             for(var i=0;i<saveFilesToFtp.length>0;i++){
//                 let file = saveFilesToFtp[i]
//                 var placeHolders = {"FileTypeName" :  clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode  : clientUtility.activityDetails.placeHolders.FileTypeName }
//                 file.name =getFormattedName(file.name, placeHolders);
//             }
//             let attachFiles =[];
//             attachFiles = files.filter((list)=>saveFilesToFtp.find((sublist)=> sublist.name.includes('*') && sublist.name.split('*') .length >0 && sublist.name.split('*')[0].includes(list.srcName.split('_')[0])))
//             const payload = {
//                 fPath: attachFiles.length > 0 ? attachFiles[0].path : '',
//                 fileType: 'zip',
//                 woId:clientUtility.activityDetails.
//                 workOrderId,
//                 confValue:'cup_sftp_packageUpload',

//                 cusId:clientUtility.activityDetails.customer.id,
//                 uploadAction:'package_zip_upload',
//                 stageName:clientUtility.activityDetails.stage.name,
//                 activityName:clientUtility.activityDetails.activity.name

//             };
//             global.log(files,saveFilesToFtp,attachFiles,'mail attachment files');

//             const headers = {
//                 'Authorization': `Bearer ${ config.server.getToken() } `
//             };
//             const sftpPacukageUpload = await post(`${ APIConfig.server.getBaseURL() }${ APIConfig.server.utils.pkgUploadOpenKmToSftp } `, payload, headers);
//             resolve(sftpPacukageUpload);

//         }catch (e){
//             global.log(e, 'checkGraphicEnabled error');
//             reject(e);
//         }
//     })
// }

//this function used to upload xl file ftp in pm despatch
const uploadxltoFTP = (clientUtility, files, saveFilesToFtp, journalid) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(saveFilesToFtp, "kj")
            for (var i = 0; i < saveFilesToFtp.length > 0; i++) {
                let file = saveFilesToFtp[i]
                var placeHolders = { "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode : clientUtility.activityDetails.placeHolders.FileTypeName }
                file.name = getFormattedName(file.name, placeHolders);
            }
            let attachFiles = [];
            attachFiles = files.filter((list) => saveFilesToFtp.find((sublist) => sublist.name == list.srcName))
            folderStructurePayload = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: clientUtility.activityDetails.du,
                customer: clientUtility.activityDetails.customer,
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: clientUtility.activityDetails.service,
                stage: clientUtility.activityDetails.stage,
                activity: clientUtility.activityDetails.activity,
                fileType: {
                    name: clientUtility.activityDetails.fileType.name,
                    id: clientUtility.activityDetails.fileType.id,
                    fileId: clientUtility.activityDetails.fileType.fileId
                }

            };
            var basePath = await getFileTypeFolderStructure(folderStructurePayload);
            const payload = {
                workorder: clientUtility.activityDetails.workOrderId,
                stage: clientUtility.activityDetails.stage.name,
                iteration: clientUtility.activityDetails.stage.iteration,
                wfeventId: clientUtility.activityDetails.wfEventId,
                articlename: clientUtility.activityDetails.itemCode,
                excelfilename: clientUtility.activityDetails.itemCode + '.xlsx',
                stageid: clientUtility.activityDetails.stage.id,
                stageiterationcount: clientUtility.activityDetails.stage.iteration,
                duid: clientUtility.activityDetails.du.id,
                customerid: clientUtility.activityDetails.customer.id,
                basePath: basePath,
                isEmail: saveFilesToFtp.length > 0 ? true : false,
                journalid,
                mailAction: 'save_pm',
                attachFiles,
                wfDefId: clientUtility.activityDetails.wfDefId,

            };
            global.log(files, saveFilesToFtp, attachFiles, 'mail attachment files');

            const headers = {
                'Authorization': `Bearer ${config.server.getToken()} `
            };
            const checkGraphicEnabled = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.uploadxltoFTP} `, payload, headers);
            resolve(checkGraphicEnabled);

        }
        catch (e) {
            global.log(e, 'checkGraphicEnabled error');
            reject(e);
        }
    });
}
//added to validate _err.htm file for 0 errors
const onSaveXmlValidation = (clientUtility, filename) => {
    return new Promise(async (resolve, reject) => {
        try {
            let FileTypeName = clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode : clientUtility.activityDetails.placeHolders.FileTypeName
            let xmlFile = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `${FileTypeName}.xml`));

            let errorOccures = [];
            var placeHolders = { "BookCode": clientUtility.activityDetails.placeHolders.BookCode, "FileTypeName": FileTypeName }
            var Checkfile = getFormattedName(filename, placeHolders);
            var htmFile = join(clientUtility.pathDetails.client.path, Checkfile);
            var checkErrorContent = "Errors: 0";
            if (xmlFile && xmlFile.length > 0) {
                //To compare the xml file and error htm file
                const htmStats = statSync(htmFile);
                const htmTime = Math.floor(htmStats.mtime.getTime() / 60000); 
                const xmlStats = statSync(xmlFile[0]);
                const xmlTime = Math.floor(xmlStats.mtime.getTime() / 60000);
                if (htmTime >= xmlTime) {
                    if (isPathExist(htmFile)) {
                        var fileContent = await readSmallFile(htmFile);
                        if (fileContent.includes(checkErrorContent)) {
                            if (errorOccures.filter(x => x.filename == basename(htmFile)).length == 0)
                                errorOccures.push({ checkErrorContent: checkErrorContent, filename: basename(htmFile) })
                        }
                        if (errorOccures.length > 0) {
                            resolve();
                        } else
                            reject(`Onsave validation failed. Please re-run Validation tool`);
                    } else {
                        reject(`${basename(htmFile)} is missing for onsave Validation`);
                    }
                } else {
                    reject(`${basename(htmFile)} Onsave validation failed xml and err.htm file modified time mismatch. Please contact iwms administrator`)
                }
            }
        }
        catch (e) {
            global.log(e, 'Word count updation failure');
            reject(e);
        }
    })
}

//Added for General Collect page count from Page info files
const isTypesetPgeFromPageInfo =  (clientUtility,files) => {
    return new Promise(async (resolve, reject) => {
        try {
            const clientPath = clientUtility.pathDetails.client.path;
            const placeHolders = { 
                "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode
                    ? clientUtility.activityDetails.placeHolders.BookCode 
                    : clientUtility.activityDetails.placeHolders.FileTypeName
            };
            const tagDetails = getFormattedName(files[0].name, placeHolders);
            const extractTagValues = (data) => {
                const tagValues = {};
                const regex = /<(\w+)>(\d+)<\/\1>/g;

                let match;
                while ((match = regex.exec(data)) !== null) {
                    tagValues[match[1]] = parseInt(match[2], 10);
                }
                return tagValues;
            };

            // Read the file
            fs.readFile(tagDetails, 'utf8', async (err, data) => {
                if (err) {
                    console.error('Error reading file:', err);
                    return;
                }

                // Extract tag values using regex
                const tagValues = extractTagValues(data);
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                // const payload = {
                //     workorder: clientUtility.activityDetails.workOrderId,
                //     tagValues,
                // };
                const payload = {
                    savetype:"typeset",
                    workorderId:clientUtility?.activityDetails?.placeHolders?.workorderId,
                    stageId:clientUtility?.activityDetails?.stage?.id,
                    iterationCount:clientUtility?.activityDetails?.stage?.iteration,
                    typesetcount:tagValues.TotalPage
                };
                const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
                resolve(typeSetResponse);
            });

        }
        catch (e) {
            global.log(e, 'Type Set Count updation failure');
            reject(e);
        }
    });
}

const getWordPageCount = async (filePath) => {
    const docxBuffer = fs.readFileSync(filePath);
 
    const pdfBuffer = await new Promise((resolve, reject) => {
        libre.convert(docxBuffer, ".pdf", undefined, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    
 
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    return pdfDoc.getPageCount(); 
};
const getWordPageandwordCount = async (filePath) => {
    try {
        const docxBuffer = fs.readFileSync(filePath);

        // Convert DOCX to PDF
        const pdfBuffer = await new Promise((resolve, reject) => {
            libre.convert(docxBuffer, ".pdf", undefined, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Load the PDF using pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();

        // Extract text from each page for word count
        
        const fullText = await extractTextFromPDF(pdfBuffer);
        const wordCount = fullText.split(/\s+/).filter((word) => word.trim() !== "").length;

        // Return both word count and page count
        return { wordCount, pageCount };
    } catch (error) {
        console.error("Error processing file:", error);
        throw error;
    }
};

const isTypesetPgeFromWord = (clientUtility, files) => {
    return new Promise(async (resolve, reject) => {
        try {
            const newWordFiles = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*.docx`));

            const placeHolders = {
                FileTypeName: clientUtility.activityDetails.placeHolders.BookCode
                    ? clientUtility.activityDetails.placeHolders.BookCode
                    : clientUtility.activityDetails.placeHolders.FileTypeName,
            };

            const wordFile = getFormattedName(files[0].name, placeHolders);
            const wordFilePath = newWordFiles[0]
                ? newWordFiles[0]
                : join(clientUtility.pathDetails.client.path, clientUtility.activityDetails.itemCode, wordFile);

            if (!wordFilePath) {
                reject(new Error("No Word file found for processing."));
                return;
            }

            const pageCount = await getWordPageCount(wordFilePath);

            if (pageCount === null) {
                reject(new Error("Unable to extract page count from the Word file."));
                return;
            }


            const payload = {
                savetype: "typeset",
                workorderId: clientUtility?.activityDetails?.placeHolders?.workorderId,
                stageId: clientUtility?.activityDetails?.stage?.id,
                iterationCount: clientUtility?.activityDetails?.stage?.iteration,
                typesetcount: pageCount || 0, 
            };

            const headers = {
                Authorization: `Bearer ${config.server.getToken()}`,
            };

            // Post data to the API
            const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
            resolve(typeSetResponse);
        } catch (e) {
            global.log(e, "Type Set Count updation failure");
            reject(e);
        }
    });
};

const pageCountFromPDF = async (clientUtility, files) => {
    return new Promise(async (resolve, reject) => {
        try {
            const clientPath = clientUtility.pathDetails.client.path;
            const placeHolders = { 
                "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode
                    ? clientUtility.activityDetails.placeHolders.BookCode 
                    : clientUtility.activityDetails.placeHolders.FileTypeName
            };
            const pageInfoFile = getFormattedName(files[0].name, placeHolders);

            // Retrieve the PDF file
            const pdfFilePath = path.join(clientPath, clientUtility.activityDetails.itemCode, pageInfoFile);
            const pdfBuffer = fs.readFileSync(pdfFilePath);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
          
            // Get the total number of pages in the PDF
            const pageCount = pdfDoc.getPages().length;

            // Prepare the payload
            const payload = {
                savetype: "typeset",
                workorderId: clientUtility?.activityDetails?.placeHolders?.workorderId,
                stageId: clientUtility?.activityDetails?.stage?.id,
                iterationCount: clientUtility?.activityDetails?.stage?.iteration,
                typesetcount: pageCount || 0
            };

            const headers = {
                Authorization: `Bearer ${config.server.getToken()}`,
            };

            // Send the payload via API
            const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
            resolve(typeSetResponse);
        } catch (error) {
            global.log(error, 'Type Set Count updation failure');
            reject(error);
        }
    });
};

const extractTextFromPDF = async (pdfBuffer) => {
    return new Promise((resolve, reject) => {
        const pdfParser = new pdf2json();

        // Handle error event
        pdfParser.on('pdfParser_dataError', (errData) => reject(errData.parserError));

        // Handle data ready event
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
            let fullText = "";
            // Loop through each page and extract text
            pdfData.Pages.forEach((page) => {
                // Loop through each text item in the page
                page.Texts.forEach((textItem) => {
                    // Decode each text item and append it to fullText
                    fullText += decodeURIComponent(textItem.R[0].T) + " ";
                });
            });
            resolve(fullText);
        });

        // Parse the PDF buffer
        pdfParser.parseBuffer(pdfBuffer);
    });
};

const isIncomingFromPdf = async (clientUtility, files) => {
    return new Promise(async (resolve, reject) => {
        try {
            const clientPath = clientUtility.pathDetails.client.path;
            const placeHolders = { 
                "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode
                    ? clientUtility.activityDetails.placeHolders.BookCode 
                    : clientUtility.activityDetails.placeHolders.FileTypeName
            };
            const pageInfoFile = getFormattedName(files[0].name, placeHolders);

            // Retrieve the PDF file
            const pdfFilePath = path.join(clientPath, pageInfoFile);
            const pdfBuffer = fs.readFileSync(clientUtility.activityDetails.iscamundaflow ? pdfFilePath : pageInfoFile);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
          
            // Get the total number of pages in the PDF
            const pages = pdfDoc.getPages();
            const pageCount = pages.length;

            let imageCount = 0;
            let totalText = "";
            pages.forEach((page) => {
                try {
                    // Check if Resources dictionary exists
                    const resources = page.node.dict.get('Resources');
                    if (resources) {
                        const xObjects = resources.get('XObject');
                        if (xObjects) {
                            // Increment image count based on the number of XObjects
                            imageCount += Object.keys(xObjects.map).length;
                        }
                    }
                } catch (error) {
                    global.log(`Error processing images on page: ${error.message}`);
                }
            });

            // Count Words with pdf-parse
            const fullText = await extractTextFromPDF(pdfBuffer);
            const wordCount = fullText.split(/\s+/).filter((word) => word.trim() !== "").length;

            // Prepare the payload
            const payload = {
                savetype: "incoming",
                workorderId: clientUtility?.activityDetails?.placeHolders?.workorderId,
                stageId: clientUtility?.activityDetails?.stage?.id,
                iterationCount: clientUtility?.activityDetails?.stage?.iteration,
                wotype: clientUtility?.activityDetails?.woType,
                mscount: pageCount,
                wordCount: wordCount,
                // imageCount:imageCount
            };

            const headers = {
                Authorization: `Bearer ${config.server.getToken()}`,
            };

            // Send the payload via API
            const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
            resolve(typeSetResponse);
        } catch (error) {
            global.log(error, 'Type Set Count updation failure');
            reject(error);
        }
    });
};

const isIncomingFromWord = (clientUtility, files) => {
    return new Promise(async (resolve, reject) => {
        try {
            const newWordFiles = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*.docx`));

            const placeHolders = {
                FileTypeName: clientUtility.activityDetails.placeHolders.BookCode
                    ? clientUtility.activityDetails.placeHolders.BookCode
                    : clientUtility.activityDetails.placeHolders.FileTypeName,
            };

            const wordFile = getFormattedName(files[0].name, placeHolders);
            const wordFilePath = newWordFiles[0]
                ? newWordFiles[0]
                : join(clientUtility.pathDetails.client.path, clientUtility.activityDetails.itemCode, wordFile);

            if (!wordFilePath) {
                reject(new Error("No Word file found for processing."));
                return;
            }

            const pageCount = await getWordPageandwordCount(wordFilePath);

            if (pageCount === null) {
                reject(new Error("Unable to extract page count from the Word file."));
                return;
            }

            const payload = {
                savetype: "incoming",
                workorderId: clientUtility?.activityDetails?.placeHolders?.workorderId,
                stageId: clientUtility?.activityDetails?.stage?.id,
                iterationCount: clientUtility?.activityDetails?.stage?.iteration,
                wotype: clientUtility?.activityDetails?.woType,
                mscount: pageCount.pageCount,
                wordCount:pageCount.wordCount,
                // imageCount:imageCount
            };

            const headers = {
                Authorization: `Bearer ${config.server.getToken()}`,
            };

            // Post data to the API
            const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
            resolve(typeSetResponse);
        } catch (e) {
            global.log(e, "Type Set Count updation failure");
            reject(e);
        }
    });
};
const isIncomingFromPageInfo =  (clientUtility,files) => {
    return new Promise(async (resolve, reject) => {
        try {

            const clientPath = clientUtility.pathDetails.client.path;
            const placeHolders = { 
                "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode
                    ? clientUtility.activityDetails.placeHolders.BookCode 
                    : clientUtility.activityDetails.placeHolders.FileTypeName
            };
            const tagDetails = getFormattedName(files[0].name, placeHolders);

            // Retrieve the PDF file
            const pageFile = path.join(clientPath, clientUtility.activityDetails.itemCode, tagDetails);
   
           
           
           
            const extractTagValues = (data) => {
                const tagValues = {};
                const regex = /<(\w+)>(\d+)<\/\1>/g;

                let match;
                while ((match = regex.exec(data)) !== null) {
                    tagValues[match[1]] = parseInt(match[2], 10);
                }
                return tagValues;
            };

            // Read the file
            fs.readFile(pageFile, 'utf8', async (err, data) => {
                if (err) {
                    console.error('Error reading file:', err);
                    return;
                }

                // Extract tag values using regex
                const tagValues = extractTagValues(data);
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                // const payload = {
                //     workorder: clientUtility.activityDetails.workOrderId,
                //     tagValues,
                // };
                const payload = {
                    savetype:"incoming",
                    workorderId:clientUtility?.activityDetails?.placeHolders?.workorderId,
                    stageId:clientUtility?.activityDetails?.stage?.id,
                    iterationCount:clientUtility?.activityDetails?.stage?.iteration,
                    typesetcount:tagValues.TotalPage
                    
                };
                const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
                resolve(typeSetResponse);
            });

        }
        catch (e) {
            global.log(e, 'Type Set Count updation failure');
            reject(e);
        }
    });
}
const imageUpload = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            
            const payload = {
                savetype: "imageupload",
                workorderId: clientUtility?.activityDetails?.placeHolders?.workorderId,
                stageId: clientUtility?.activityDetails?.stage?.id,
                iterationCount: clientUtility?.activityDetails?.stage?.iteration,
           
            };

            const headers = {
                Authorization: `Bearer ${config.server.getToken()}`,
            };

            // Post data to the API
            const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.savePageDetails}`, payload, headers);
            resolve(typeSetResponse);
        } catch (e) {
            global.log(e, "Type Set Count updation failure");
            reject(e);
        }
    });
};
//added to validate all _err.htm nd html file for 0 errors

// const ishtmValdReq = (clientUtility) => {
//     return new Promise(async (resolve, reject) => {
//         try {
//             let errorOccures = [];
//             // var placeHolders = { "BookCode": clientUtility.activityDetails.placeHolders.BookCode, "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode : clientUtility.activityDetails.placeHolders.FileTypeName }
//             //var htmlFile = getFormattedName(filename, placeHolders);
//             const htmErrCnt = "Errors: 0";
//             const htmlErrCnt = ["Errors:  0 errors", "Fatal Errors:  0 fatal errors"];

//             let htmFiles = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*_err.htm`));
//             let htmlFiles = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*_summary.html`));

//             if (!htmFiles || htmFiles.length === 0) {
//                 reject(`Error htm is missing. Please check`);

//             }else if(!htmlFiles || htmlFiles.length === 0) {
//                 reject(`Summary html is missing. Please check`);

//             }

//             const htmFile = htmFiles?.[0]
//             if (isPathExist(htmFile)) {
//                 var fileContent = await readSmallFile(htmFile);
//                 if (!fileContent.includes(htmErrCnt)) {
//                     if (errorOccures.filter(x => x.filename == basename(htmFile)).length == 0)
//                         errorOccures.push({ checkErrorContent: htmErrCnt, filename: basename(htmFile) })
//                 }

//                 const htmlFile = htmlFiles?.[0]
//                 if (isPathExist(htmlFile)) {
//                     var fileContent = await readSmallFile(htmlFile);
//                     for (let error of htmlErrCnt) {
//                         if (!fileContent.includes(error)) {
//                             if (errorOccures.filter(x => x.filename == basename(htmlFile)).length == 0) {
//                                 errorOccures.push({ checkErrorContent: htmlErrCnt, filename: basename(htmlFile) });
//                             }

//                         }
//                     }
//                 }
//                 else{
//                     reject(`${basename(htmlFile)} is missing.`);
//                 }
//                 if (errorOccures.length > 0) {
//                     let filenames = errorOccures.map(item => item.filename.replace('.pdf', ''));
//                     let errorMsg = `Please check, Validation failed for ${filenames.join(', ')}.`;
//                     console.log(errorMsg);
//                     reject(errorMsg);

//                 } else
//                     resolve();

//             } else
//                 reject(`${basename(htmFile)} is missing for onsave Validation`);
//         }
//         catch (e) {
//             global.log(e, 'ishtmValdReq failure');
//             reject(e);
//         }
//     })
// }


//added to validate all _err.htm nd html file for 0 errors

const ishtmValdReq = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            let errorOccures = [];
            // var placeHolders = { "BookCode": clientUtility.activityDetails.placeHolders.BookCode, "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode : clientUtility.activityDetails.placeHolders.FileTypeName }
            //var htmlFile = getFormattedName(filename, placeHolders);
            const htmErrCnt = "Errors: 0";
            const htmlErrCnt = ["Errors:  0 errors", "Fatal Errors:  0 fatal errors"];

            let htmFiles = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*_err.htm`));
            let htmlFiles = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*_summary.html`));

            if (!htmFiles || htmFiles.length === 0) {
                reject(`Error htm is missing. Please check`);

            }else if(!htmlFiles || htmlFiles.length === 0) {
                reject(`Summary html is missing. Please check`);

            }

            const htmFile = htmFiles?.[0]
            if (isPathExist(htmFile)) {
                var fileContent = await readSmallFile(htmFile);
                if (!fileContent.includes(htmErrCnt)) {
                    if (errorOccures.filter(x => x.filename == basename(htmFile)).length == 0)
                        errorOccures.push({ checkErrorContent: htmErrCnt, filename: basename(htmFile) })
                }

                const htmlFile = htmlFiles?.[0]
                if (isPathExist(htmlFile)) {
                    var fileContent = await readSmallFile(htmlFile);
                    for (let error of htmlErrCnt) {
                        if (!fileContent.includes(error)) {
                            if (errorOccures.filter(x => x.filename == basename(htmlFile)).length == 0) {
                                errorOccures.push({ checkErrorContent: htmlErrCnt, filename: basename(htmlFile) });
                            }

                        }
                    }
                }
                else{
                    reject(`${basename(htmlFile)} is missing.`);
                }
                if (errorOccures.length > 0) {
                    let filenames = errorOccures.map(item => item.filename.replace('.pdf', ''));
                    let errorMsg = `Please check, Validation failed for ${filenames.join(', ')}.`;
                    console.log(errorMsg);
                    reject(errorMsg);

                } else
                    resolve();

            } else
                reject(`${basename(htmFile)} is missing for onsave Validation`);
        }
        catch (e) {
            global.log(e, 'ishtmValdReq failure');
            reject(e);
        }
    })
}

//added for acs wordcount with and without reference and table and figures and euqations
const isWordCount = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            let newWord = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path, '**', `*_wordcount.txt`));
            const wordFile = newWord[0] ? newWord[0] : join(clientUtility.pathDetails.client.path, clientUtility.activityDetails.itemCode, `${clientUtility.activityDetails.itemCode}_wordcount.txt`);


            const extractTagValues = (data) => {
                const tagValues = {};
                const regex = /<(\w+)>([^<]+)<\/\1>/g; // Updated regex to capture all values
                let match;

                while ((match = regex.exec(data)) !== null) {
                    const tag = match[1];
                    const value = match[2].trim();

                    if (!/^\d+$/.test(value)) { // Check if value is not a number
                        throw new Error(`Invalid value found in tag <${tag}>: "${value}" is not a number`);
                    }

                    tagValues[tag] = parseInt(value, 10);
                }

                return tagValues;
            };

            // **Wrap fs.readFile in a Promise**
            const readFilePromise = (filePath) => {
                return new Promise((resolve, reject) => {
                    fs.readFile(filePath, 'utf8', (err, data) => {
                        if (err) {
                            reject(err); // Properly reject on error
                        } else {
                            resolve(data);
                        }
                    });
                });
            };

            // **Wait for file read**
            const data = await readFilePromise(wordFile);
            const tagValues = extractTagValues(data);

            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const payload = {
                workorder: clientUtility.activityDetails.workOrderId,
                tagValues,
            };

            // **Await the post request and handle errors properly**
            try {
                const worcountresponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.isWordCount}`, payload, headers);
                resolve(worcountresponse);
            } catch (error) {
                reject(error); // Properly reject on API failure
            }
        } catch (e) {
            global.log(e, 'Word count updation failure');
            reject(e);
        }
    });
}

const isWordCountForFile = (clientUtility,fileName) => { //based on file based word count checking
    return new Promise(async (resolve, reject) => {
        try {
            let newWord = await retreiveLocalFiles(join(clientUtility.pathDetails.client.path,'**', `*${fileName}`))
            const wordFile = newWord[0]  ? newWord[0] : join(clientUtility.pathDetails.client.path, clientUtility.activityDetails.itemCode, `${clientUtility.activityDetails.itemCode}_wordcount.txt`);
            const extractTagValues = (data) => {
                const tagValues = {};
                const regex = /<(\w+)>(\d+)<\/\1>/g;

                let match;
                while ((match = regex.exec(data)) !== null) {
                    tagValues[match[1]] = parseInt(match[2], 10);
                }
                return tagValues;
            };

            // Read the file
            fs.readFile(wordFile, 'utf8', async (err, data) => {
                if (err) {
                    console.error('Error reading file:', err);
                    return;
                }

                // Extract tag values using regex
                const tagValues = extractTagValues(data);
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const payload = {
                    workorder: clientUtility.activityDetails.workOrderId,
                    tagValues,
                };
                const worcountresponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.isWordCount}`, payload, headers);
                resolve(worcountresponse);
                console.log(worcountresponse);
            });

        }
        catch (e) {
            global.log(e, 'Word count updation failure');
            reject(e);
        }
    });
}

const isWordCountFromTxt = (filePath) => {
    return new Promise(async (resolve, reject) => {
        try {
            const extractTagValues = (data) => {
                const tagValues = {};
                const regex = /<(\w+)>(\d+)<\/\1>/g;

                let match;
                while ((match = regex.exec(data)) !== null) {
                    tagValues[match[1]] = parseInt(match[2], 10);
                }
                return tagValues;
            };

            // Read the file
            fs.readFile(filePath, 'utf8', async (err, data) => {
                if (err) {
                    console.error('Error reading file:', err);
                    return;
                }

                // Extract tag values using regex
                const tagValues = extractTagValues(data);
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const payload = {
                    workorder: clientUtility.activityDetails.workOrderId,
                    tagValues,
                };
                const worcountresponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.isWordCount}`, payload, headers);
                resolve(worcountresponse);
                console.log(worcountresponse);
            });

        }
        catch (e) {
            global.log(e, 'Word count updation failure');
            reject(e);
        }
    });
}

//this function used to  send email with attached document 


const onSaveMailTrigger = (clientUtility, files, onsavemailtrigger, data) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(onsavemailtrigger, "kj")
            for (var i = 0; i < onsavemailtrigger.length > 0; i++) {
                let file = onsavemailtrigger[i]
                var placeHolders = { "FileTypeName": clientUtility.activityDetails.placeHolders.BookCode ? clientUtility.activityDetails.placeHolders.BookCode : clientUtility.activityDetails.placeHolders.FileTypeName }
                file.name = getFormattedName(file.name, placeHolders);
            }
            let attachFiles = [];
            attachFiles = files.filter((list) => onsavemailtrigger.find((sublist) => sublist.name == list.srcName))

            if (data.journalAcronym == 'GPLR') {
                attachFiles.push(files.filter((list) => list.srcName == `${data.journalAcronym}_${data.volumeNo}_${data.issueNo}.pdf`))
            }
            const payload = {
                workorder: clientUtility.activityDetails.workOrderId,
                articlename: clientUtility.activityDetails.itemCode,
                stageid: clientUtility.activityDetails.stage.id,
                customerid: clientUtility.activityDetails.customer.id,
                journalid: data.journalid,
                journalAcronym: data.journalAcronym,
                issueName: data.issueName,
                attachFiles
            };
            global.log(files, onsavemailtrigger, attachFiles, 'mail attachment files');

            const headers = {
                'Authorization': `Bearer ${config.server.getToken()} `
            };
            const checkGraphicEnabled = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.onSaveMailTrigger} `, payload, headers);
            resolve(checkGraphicEnabled);

        }
        catch (e) {
            global.log(e, 'checkGraphicEnabled error');
            reject(e);
        }
    });
}

const graphiconsave = async (postActivity, clientUtility, isGraphicOnSaveReq) => {
    return await new Promise(async (resolve, reject) => {
        try {
            const { getGraphicIterationDetails } = require('../preprocessing')
            // if (Object.entries(graphiconsave).length > 0) {
            // let chkApiin = 0;
            var details = []
            var checkGraphicCompleted = []
            // var graphicKeys = Object.keys(graphiconsave);
            // let graphicAty = graphicKeys.filter(x => graphiconsave[x] == true);
            // if (graphicAty.length > 0 && chkApiin == 0) {
            // chkApiin = 1;
            for (let i = 0; i < postActivity.length; i++) {
                let payload = {
                    wfdefid: postActivity[i]
                }
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()} `
                };
                const url = APIConfig.server.utils.getGraphicStageActivityDetails
                details = await post(`${APIConfig.server.getBaseURL()}${url} `, payload, headers);
                if (Array.isArray(details) && details.length > 0) {
                    payload = {
                        workOrderId: clientUtility.activityDetails.workOrderId,
                        activityId: details[0].activityId,
                        stageId: '10'
                    }
                } else if (Object.keys(details).length > 0) {
                    payload = {
                        workOrderId: clientUtility.activityDetails.workOrderId,
                        activityId: details.activityId,
                        stageId: '10'
                    }
                }
                if (payload) {
                    checkGraphicCompleted = await getGraphicIterationDetails(payload, clientUtility)

                }
                // }
                var graphic = []
                console.log(checkGraphicCompleted, isGraphicOnSaveReq)
                for (let i = 0; i < Object.keys(isGraphicOnSaveReq).length; i++) {
                    for (let j = 0; j < Object.keys(checkGraphicCompleted).length; j++) {
                        if (checkGraphicCompleted[j].woincomingfileid == isGraphicOnSaveReq[i].woincomingfileid) {
                            if (checkGraphicCompleted[j].activitystatus !== 'Completed') {
                                graphic.push(checkGraphicCompleted[j])
                            }
                        }
                    }
                }

                if (graphic.length > 0 && clientUtility.activityDetails.instanceType === 'Single') {
                    throw `Please Complete Graphics Stage ${graphic[0].activityalias} activity before saving this activity`
                }
                else if (graphic.length > 0 && clientUtility.activityDetails.instanceType === 'Multiple') {
                    graphic.forEach((data) => {
                        if (data.woincomingfileid === clientUtility.activityDetails.fileType.fileId) {
                            throw `Please Complete Graphics Stage ${data.activityalias}activity before saving this activity`
                        }

                    });
                }
            }
            resolve(graphic)

        } catch (er) {
            console.log(er);
            reject({ message: er })
        }
    });
}

const readXmlExport = (clientUtility,exportXMLFileName) => {
    return new Promise(async (resolve, reject) => {
        try {
            
            const clientPath = clientUtility.pathDetails.client.path;
            let formattedXMLName = getFormattedName(exportXMLFileName, clientUtility.activityDetails.placeHolders);
            let folderStructureWithRoot = extendedJoin([clientUtility.pathDetails.client.path, '/']);
            let srcFiles = await retreiveLocalFiles(extendedJoin([folderStructureWithRoot, '**', '*']), []);
            console.log(srcFiles, 'srcFiles');

            const regexPattern = new RegExp(formattedXMLName.replace('.', '\\.').replace('*', '.*') + '$');
            // Find the matching file
            const matchedFile = srcFiles.find(file => regexPattern.test(file));
            const matchedPath = `${clientPath}/${basename(matchedFile)}`
            // Retrieve the xmlFilePath file
                fs.readFile(matchedPath, 'utf-8',async (err, data) => {
                if (err) {
                  console.error('Error reading XML:', err);
                  return;
                }
                // Extract value of <suppl-materials>
                const match = data.match(/<suppl-materials>(.*?)<\/suppl-materials>/);
                let isSuplimentaryFile = match[1]?.toLowerCase() === 'no' ? false : true;
                const payload = {
                    workorderId: clientUtility?.activityDetails?.placeHolders?.workorderId,
                    stageId: clientUtility?.activityDetails?.stage?.id,
                    iterationCount: clientUtility?.activityDetails?.stage?.iteration,
                    value:isSuplimentaryFile,
                    type:'suplimentary',
                    woincomingFileId: clientUtility.activityDetails.fileType.fileId ? clientUtility.activityDetails.fileType.fileId : null
                };
    
                const headers = {
                    Authorization: `Bearer ${config.server.getToken()}`,
                };
    
                // Post data to the API
                const typeSetResponse = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.readXmlExport}`, payload, headers);
                resolve(typeSetResponse);
              });

        } catch (e) {
            global.log(e, "Type Set Count updation failure");
            reject(e);
        }
    });
};


module.exports = {
    onSaveValidationForTools, getToolDetails,
    GetAllFiles, getIncomingFileTypeDetails, onSaveValidationForServiceTools, graphiconsave, checkGraphicEnabled, uploadxltoFTP, isWordCount, onSaveXmlValidation,ishtmValdReq, onSaveMailTrigger, isWordCountFromTxt,
    isTypesetPgeFromPageInfo, isTypesetPgeFromWord,pageCountFromPDF, isIncomingFromPdf, isIncomingFromWord, imageUpload, isIncomingFromPageInfo,isWordCountForFile,readXmlExport
}
