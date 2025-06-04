const { openFolder } = require('../utils/explorer/index');
const { getChecksum } = require('../utils/index');
const { isPathExist, makeDir, extendedJoin, writeSmallFile, readdirSync, getFormattedName,removeFile, retreiveFiles ,readSmallFile} = require('../utils/io');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { post, get } = require('../http/index');
const { basename, join, extname } = require('path');
const okmHelper = require('../utils/okm');
const micromatch = require('micromatch');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { preProcessing } = require('./preprocessing');
const { extractZip } = require('../main/postProcessing/tools')
const { acsExtractZip,extractWithoutZipName } = require('../main/postProcessing/tools')
const pLimit = require('p-limit');
const os = require('os');
const path = require('path');
const fs = require("fs");
const { getRetreiveBlobFilesURL } = require("../utils/azure.js");
const { getRetreivelocalFilesURL } = require("../utils/local.js");





class OpenExporer {
    fileStatus = {
        download: [],
        downloaded: [],
        new: [],
        mandatoryInFiles: []
    };
    explorerPath = null;
    filesInfo = {
        folderName: null,
        isFileCopy: null,
        actFileMapId: null,
        key: null,
        data: [],
        extractedFiles: [],
    };
    isAutoOpenReq = false;

    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }

    startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.clientUtility.updateStatusToServer({ message: 'Fetching File Details', progress: 30 }, 2);
                await this.fetchDetails(payload);
                await this.clientUtility.updateStatusToServer({ message: 'Fetched File Details', progress: 35 }, 2);
                await this.checkFirstTimeCreatedActivity();
                await this.clientUtility.updateStatusToServer({ message: 'Pre Processing Started', progress: 38 }, 2);
                await this.preProcessing(payload)
                this.createFolder(this.clientUtility.pathDetails.client.path);
                await this.createFileTypeFolders();
                if (this.filesInfo.isFileCopy) {
                    await this.clientUtility.updateStatusToServer({ message: 'Analyzing Files', progress: 55 }, 2);
                    if (this.clientUtility.activityDetails.iscamundaflow) {
                        await this.fetchFileStatus();
                    } else {
                        // let unOptionalFiles = this.filesInfo?.extractedFiles.filter((list) => !list.isOptional) || [];
                        let unOptionalFiles = [];
                        if (this.action == 'pending') {
                            unOptionalFiles = this.filesInfo?.extractedFiles.filter((list) => list.mandatoryCheck.pending) || [];
                        } else {
                            unOptionalFiles = this.filesInfo?.extractedFiles.filter((list) => list.mandatoryCheck.save) || [];
                        }
                        if (unOptionalFiles && unOptionalFiles.length > 0) {
                            await this.mandatoryInFileCheck(unOptionalFiles);
                            await this.validate();
                        };
                        await this.constructDownloadPayload();
                    }
                    await this.clientUtility.updateStatusToServer({ message: 'Analyzed Files', progress: 60 }, 2);
                    global.log(this.fileStatus.download.map((file) => file.folderPath + file.name), 'Download files');
                    await this.downloadFiles();
                }
                if (this.clientUtility.activityDetails && this.clientUtility.activityDetails.BookDetails) {
                    let name = getFormattedName(this.clientUtility.activityDetails.BookDetails.fileName, this.clientUtility.activityDetails.placeHolders)
                    await writeSmallFile(join(this.wf, name), this.clientUtility.activityDetails.BookDetails.content);
                }
                if (this.clientUtility.activityDetails && this.clientUtility.activityDetails.FigureDetails) {
                    await writeSmallFile(join(this.wf, this.clientUtility.activityDetails.FigureDetails.fileName), this.clientUtility.activityDetails.FigureDetails.content);
                }

                await this.clientUtility.updateStatusToServer({ message: 'Opening explorer', progress: 80 }, 2);
                let localFiles = [];
                if (!this.clientUtility.activityDetails.iscamundaflow) {
                    localFiles = [...this.fileStatus.download, ...this.fileStatus.downloaded]
                }

                await this.clientUtility.updateStatusToServer({ message: `${this.clientUtility.pathDetails.client.path}`, progress: 80, isPath: true, localDownloadFiles: localFiles }, 2);
                var folderPath = ''
                let files = [];
                this.filesInfo.data.forEach(element => {
                    //files.push(this.clientUtility.activityDetails.validationFileConfig[element.typeId].files)

                    this.clientUtility.activityDetails.validationFileConfig && this.clientUtility.activityDetails.validationFileConfig[element.typeId] && this.clientUtility.activityDetails.validationFileConfig[element.typeId].files ? files.push(this.clientUtility.activityDetails.validationFileConfig[element.typeId].files) : files
                });
                if (this.clientUtility.activityDetails.iscamundaflow == false) {
                    this.filesInfo.extractedFiles.forEach(element => {
                        files.push({path: element.outfileName,custom: element.custom})
                        });
                }
                if (this.clientUtility.activityDetails.iscamundaflow == false) {
                let customCopy = this.filesInfo?.extractedFiles.filter(file => (file.custom  == "CutsomeCopy"))
                if(customCopy.length){
                    let txtfile = await retreiveFiles(customCopy[0].name)
                    let txtContent = await readSmallFile(txtfile[0])
                    let localPath = customCopy[0].outfileName
                    await writeSmallFile(localPath,txtContent)
                }
                }
                let unzipRequired = files.flat().filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "unziprequired").length > 0);
                let unzipWithoutZipName = files.flat().filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "unzipwithoutzipname").length > 0);
                let acsNotesRequired = files.flat().filter(file => (file.custom || []).includes("acsNotesRequired"));
                let cupEllocationRequired = files.flat().filter(file => (file.custom || []).includes("cupEllocationRequired"));
                let acsDNPRequired = files.flat().filter(file => (file.custom || []).includes("acsDNPRequired"));
                let convertFileRequired = files.flat().filter(file => (file.custom || []).includes("convertFileType"));
                let fileSequenceRequired = files.flat().filter(file => (file.custom || []).includes("isfilesequenceReq"));
                let fileSequence = files.flat().filter(file => (file.custom || []).includes("generate_fileSequence"));
                let fileSequenceTemplate = files.flat().filter(file => (file.custom || []).includes("generate_filesequence_template"));
                let localPath = files.flat().filter(file => (file.custom || []).includes("generate_localpath"));
                let vtwJsonServiceCall = files.flat().filter(file => (file.custom || []).includes("vtw_json_service_call"));
                if(localPath.length){
                    let fileCont = `${this.clientUtility.pathDetails.client.path}`
                    let workingPath = path.join(path.dirname(this.clientUtility.pathDetails.client.path),  basename(localPath[0].path));
                    fs.writeFile(workingPath, fileCont, err => {
                        if (err) {
                            console.error('Error writing file:', err);
                            return;
                        }
                        console.log('Data written to file successfully.');
                    });
                }
                if (fileSequence.length) {
                    let fileCont ;
                    let fileType= extname(fileSequence[0].path)
                    switch (fileType) {
                        case '.txt':
                            fileCont = await this.getFileSequenceCommon();
                            break;
                        case '.json':
                            fileCont = await this.getFileSequenceCommon();
                            break;
                        case '.xml':
                            fileCont = await this.getFileSequence();
                            break;
                        default:
                            break;
                    }
                   
                    if (fileCont) {
                        let workingPath = path.join(this.clientUtility.pathDetails.client.path, basename(fileSequence[0].path));
                        fs.writeFile(workingPath, fileCont, err => {
                            if (err) {
                                console.error('Error writing file:', err);
                                return;
                            }
                            console.log('Data written to file successfully.');
                        });
                    }
                }
                if (fileSequenceTemplate.length) {

                    let fileCont = await this.getFileSequenceTemplate();
                    
                    if (fileCont) {
                        let workingPath = path.join(this.clientUtility.pathDetails.client.path, basename(fileSequenceTemplate[0].path));
                        fs.writeFile(workingPath, fileCont, err => {
                            if (err) {
                                console.error('Error writing file:', err);
                                return;
                            }
                            console.log('Data written to file successfully.');
                        });
                    }
                }
                if (fileSequenceRequired.length) {
                    let fileCont = await this.getFileSequence();
                    if (fileCont) {
                        let workingPath = path.join(this.clientUtility.pathDetails.client.path, 'FileSequence.xml');

                        // if (fs.existsSync(workingPath)) {
                        await fs.writeFile(workingPath, fileCont, err => {
                            if (err) {
                                console.error('Error writing file:', err);
                                return;
                            }
                            console.log('Data written to file successfully.');
                        });
                        //  }
                    }
                }
                //added for acs notes 
                if (acsNotesRequired.length > 0) {
                    let acsNote = await this.getACSnotes();
                    if (acsNote != null && acsNote != undefined && acsNote != "") {
                        let acsNoteContent = `<notesFromVendor>${acsNote}</notesFromVendor>`;
                        if (acsNoteContent) {
                            let workingPath = path.join(this.clientUtility.pathDetails.client.path, this.clientUtility.activityDetails.itemCode, 'NotesFromVendor.txt');
                            await fs.writeFile(workingPath, acsNoteContent, err => {
                                if (err) {
                                    console.error('Error writing file:', err);
                                    return;
                                }
                                console.log('Data written to file successfully.');
                            });
                        }
                    }
                }

                //cupEllocationRequired
                if (cupEllocationRequired.length > 0) {
                    let ellocationID = await this.getEllocationID();
                    if (ellocationID != null && ellocationID != undefined && ellocationID != "") {
                        let ellocationContent = ellocationID;
                        if (ellocationContent) {
                            let workingPath = path.join(this.clientUtility.pathDetails.client.path, 'Elocation-id.txt');
                            await fs.writeFile(workingPath, ellocationContent, err => {
                                if (err) {
                                    console.error('Error writing file:', err);
                                    return;
                                }
                                console.log('Data written to file successfully.');
                            });
                        }
                    }
                }

                //added for acs DNP 
                if (acsDNPRequired.length > 0) {
                    let acsDNPFiles = await this.getACSDNP();
                    if (acsDNPFiles && Array.isArray(acsDNPFiles) && acsDNPFiles.length > 0) {
                        let acsDNPContent = `<doNotPublishFiles>${acsDNPFiles.map(file => `<doNotPublishFile name="${file}"/>`).join('\n')}</doNotPublishFiles>`;
                
                        let workingPath = path.join(
                            this.clientUtility.pathDetails.client.path,
                            this.clientUtility.activityDetails.itemCode,
                            'DoNotPublish.txt'
                        );
                        await fs.writeFile(workingPath, acsDNPContent, err => {
                            if (err) {
                                console.error('Error writing file:', err);
                                return;
                            }
                            console.log('Data written to file successfully.');
                        });
                    }
                }
                // adde for Convert File
                if (convertFileRequired.length > 0) {
                    let acsNote = await this.getConvertFile();
                    if (acsNote != null && acsNote != undefined && acsNote.length > 0) {
                        const convertFileTypesXml =
                            `<convertFileTypes>\n` +
                            acsNote
                                .map(file => {
                                return `<convertFileType sourceType="weo" targetType="si" sourceName="${file.sourceName}" targetName="${file.targetName}"/>`;
                                })
                                .join('\n') +
                            `\n</convertFileTypes>`;
                        if (convertFileTypesXml) {
                            let workingPath = path.join(this.clientUtility.pathDetails.client.path, this.clientUtility.activityDetails.itemCode, 'ConvertFile.txt');
                            await fs.writeFile(workingPath, convertFileTypesXml, err => {
                                if (err) {
                                    console.error('Error writing file:', err);
                                    return;
                                }
                                console.log('Data written to file successfully.');
                            });
                        }
                    }
                }

                if (vtwJsonServiceCall.length > 0) {
                    const vtwJson = await this.getVtwJsonServiceCall();
                    if(vtwJson.issuccess){
                        let workingPath = path.join(
                            this.clientUtility.pathDetails.client.path,
                            'ServiceCall.json'
                        );
                        const jsonString = JSON.stringify(vtwJson.data, null, 2);
                        fs.writeFileSync(workingPath, jsonString, err => {
                            if (err) {
                                console.error('Error writing file:', err);
                                return;
                            }
                            console.log('Data written to file successfully.');
                        });
                    }
                }                
                if (unzipWithoutZipName.length > 0 && this.filesInfo.isFileCopy) {
                       let zipFilePath=[]
                       unzipWithoutZipName.forEach((file) => {
                        if (extname(file.name) === '.zip' ) {
                            let fullPath = join(this.clientUtility.pathDetails.client.path,file.name);
                            zipFilePath.push(fullPath);
                        }
                    });
                        if (zipFilePath.length>0) {
                            for( let i=0;i<zipFilePath.length;i++)
                            {
                                folderPath=zipFilePath[i]
                                folderPath=await getFormattedName(folderPath,this.clientUtility.activityDetails.placeHolders)
                                if(isPathExist(folderPath))
                                {
                                    let unZipResult=await extractWithoutZipName(folderPath, false).catch(err => console.log(err));
                                    if(unZipResult)
                                    {
                                        if(isPathExist(folderPath))
                                        {
                                            await removeFile(folderPath)
                                        }
                                    }
                                
                                }

                            }

                        }
                }
                if (unzipRequired.length > 0) {
                    if (this.clientUtility.activityDetails.config.displayName == 'Package Creation') {
                        const files = this.fileStatus.downloaded.filter((x) => {
                            return x.name.split('.zip').some((part) => part.includes('cams_pkg'))
                        });
                        folderPath = files.length > 0 ? files[0].folderPath + files[0].name : ''
                        if (folderPath) {
                            await extractZip(folderPath, false)
                        }
                    }
                    else if (this.clientUtility.activityDetails.wfId == '35' && (this.clientUtility.activityDetails.config.displayName == 'Image upload' || this.clientUtility.activityDetails.config.displayName == 'Structuring and XML Conversion' || this.clientUtility.activityDetails.activity.id == '396'|| this.clientUtility.activityDetails.activity.id == '548')) {

                        let zipFiles = this.fileStatus.download
                            .filter((file) => extname(file.name) === '.zip')
                            .map((file) => {
                                console.log(file.folderPath + file.name);
                                return file.folderPath + file.name;
                            });

                        for (let files of zipFiles) {
                                let  isExtractInRoot=  basename(files).includes('Images.zip')?true:false;
                                let pendingLength = await this.checkPendingStatus();
                                if (pendingLength == 0) {
                                    await acsExtractZip(files, false,isExtractInRoot).catch(err => console.log(err));
                                }  
                            }
                        }
                    }
                   
                    else {


                        this.fileStatus.download.filter((file) => {
                            if (extname(file.name) === '.zip') {
                                console.log(file.folderPath + file.name)
                                folderPath = file.folderPath + file.name;
                            }
                        })
                        if (folderPath) {
                            await extractZip(folderPath, false).catch(err => console.log(err));
                        }

                        // if (folderPath) {

                        //     let zipStructureCount = await this.checkZipFolderStructure(folderPath);
                        //     if (zipStructureCount == 1) {
                        //         let pendingLength = await checkPendingStatus();
                        //         if (pendingLength == 0) {
                        //             await acsExtractZip(folderPath, false).catch(err => console.log(err));
                        //         }

                        //     }
                        //     else {
                        //         await extractZip(folderPath, false).catch(err => console.log(err));

                        //     }
                        // }



                        this.fileStatus.downloaded.filter((file) => {
                            if (extname(file.name) === '.zip') {
                                console.log(file.folderPath + file.name)
                                folderPath = file.folderPath + file.name;
                            }
                        })

                        // if (folderPath) {

                        //   let zipStructureCount = await this.checkZipFolderStructure(folderPath);
                        //   if (zipStructureCount == 1) {
                        //       let pendingLength = await checkPendingStatus();
                        //       if (pendingLength == 0) {
                        //           await acsExtractZip(folderPath, false).catch(err => console.log(err));
                        //       }

                        //   }
                        //   else {
                        //       await extractZip(folderPath, false).catch(err => console.log(err));

                        //   }

                        // }
                        if (folderPath) {
                            await extractZip(folderPath, false).catch(err => console.log(err));
                        }


                    }

                // if (this.clientUtility.autoOpenReq) {
                //     openFolder(this.explorerPath);
                // } else if (payload.isAutoOpenReq) {
                //     openFolder(this.explorerPath);
                // } else {
                //     //!0==this.clientUtility.autoOpenReq?payload.isAutoOpenReq&&openFolder(this.explorerPath):openFolder(this.explorerPath);
                // }
                resolve();
            } catch (err) {
                global.log(err, 'OpenExporer');
                reject(err);
            }
        });
    }



    async checkFirstTimeCreatedActivity() {
        const filePayload = {
            wfEventId: this.clientUtility.activityDetails.wfEventId
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.checkFirstTimeCreatedActivity}`, filePayload, headers);
        this.clientUtility.firstTimeWip = result && result.length > 0 ? true : false;
        this.clientUtility.autoOpenReq = result && result[0] && result.length > 0 ? result[0].autoopenreq : true;
    }
    //added by vaithi
    async checkPendingStatus() {
        const filePayload = {
            wfEventId: this.clientUtility.activityDetails.wfEventId
        };

        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.checkPendingStatus}`, filePayload, headers);
        // this.clientUtility.firstTimeWip = result && result.length > 0 ? true : false
        return result.length;
    }
    async getACSnotes() {
        const filePayload = {
            workorderId: this.clientUtility.activityDetails.workOrderId,
            stageId:this.clientUtility.activityDetails.stage.id
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getdataACSnotes}`, filePayload, headers);
        // this.clientUtility.firstTimeWip = result && result.length > 0 ? true : false
        const notesValue = (result && result.length > 0 && result[0].note) ? result[0].note : null;
        return notesValue;
    }

    async getConvertFile() {
        const filePayload = {
            workorderId: this.clientUtility.activityDetails.workOrderId,
            stageId:this.clientUtility.activityDetails.stage.id
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getdataConvertFile}`, filePayload, headers);
        // this.clientUtility.firstTimeWip = result && result.length > 0 ? true : false
        const notesValue = (result && result.length > 0 && result) ? result : null;
        return notesValue;
    }
    async getEllocationID() {
        const filePayload = {
            workorderId: this.clientUtility.activityDetails.workOrderId,
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getEllocationID}`, filePayload, headers);
        // this.clientUtility.firstTimeWip = result && result.length > 0 ? true : false
        const notesValue = (result && result.length > 0 && result[0].elocationid) ? result[0].elocationid : null;
        return notesValue;
    }
    async getACSDNP() {
        const filePayload = {
            workorderId: this.clientUtility.activityDetails.workOrderId,
            stageId:this.clientUtility.activityDetails.stage.id
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getdataACSDNP}`, filePayload, headers);
        const DNPValue = (result && result.length > 0 && result[0].donotpublish) ? result[0].donotpublish : null;
        return DNPValue;
    }
    async getVtwJsonServiceCall() {
        try{
            const piivalue = this.clientUtility.activityDetails.placeHolders.PII;
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const result = await get(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getVtwJsonServiceCall}${piivalue}`, {}, headers);
            return result;
        }
        catch(err){
            global.log(err.message || JSON.stringify(err), 'getVtwJsonServiceCall');
            return ({issuccess: false, message: err.message || JSON.stringify(err)});
        }
    }
    async getFileSequence() {
        const filePayload = {
            workorderId: this.clientUtility.activityDetails.workOrderId,
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        let fileSeqData = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getFileSequenceForSprBook}`, filePayload, headers);
        let fileSeq = fileSeqData.data.sort((a, b) => a.file_sequence - b.file_sequence);

        let fileSeqCont = `<?xml version="1.0" encoding="utf-8"?>\n <FileDetails>\n`;
        fileSeq.map((file) => {
            fileSeqCont += `<FileName>${file.filename}</FileName>\n <FileSequence>${file.file_sequence}</FileSequence>\n`
        })
        fileSeqCont += `</FileDetails>`;
        return fileSeqCont;
    }

    async getFileSequenceTemplate() {
        let sourceData = this.clientUtility;
        const filePayload = {
            workorderId: sourceData.activityDetails.workOrderId,
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        let fileSeqData = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getFileSequenceTemplate}`, filePayload, headers);
        let fileSeq = fileSeqData.data.sort((a, b) => a.file_sequence - b.file_sequence);

        let fileSeqCont = `<?xml version="1.0" encoding="utf-8"?>\n<Book>\n`;

    if(sourceData.activityDetails.wfId == '55'){
    fileSeqCont += `<journalname>${sourceData.activityDetails.placeHolders.JournalName}</journalname>\n`;
    fileSeqCont += `<stagename>${sourceData.activityDetails.placeHolders.stagecode}</stagename>\n`;
    fileSeqCont += `<issuestartpage>10</issuestartpage>\n`;

    fileSeq.forEach((file, index) => {
        const totalPages = file.endPage - file.startPage + 1; // Assuming you calculate total pages dynamically
        fileSeqCont += `<File>\n`;
        fileSeqCont += `<FileName>${file.filename || null}</FileName>\n`;
        fileSeqCont += `<SeqId>${file.filesequence || null}</SeqId>\n`;
        fileSeqCont += `<startpages>${file.startPage || null}</startpages>\n`; // Defaulting to 1 if not provided
        fileSeqCont += `<endpages>${file.endPage || null}</endpages>\n`; // Defaulting to 1 if not provided
        fileSeqCont += `<totalpages>${file.typesetpage || null}</totalpages>\n`; // Defaulting to 1 if not calculable
        fileSeqCont += `<Type>${file.filetype || null }</Type>\n`; // Defaulting to "Article"
        fileSeqCont += `</File>\n`;
    });
    }
    else{
        console.log("XML template not written for this wfid")
    }  
    
    fileSeqCont += `</Book>`;
    return fileSeqCont;
    }
    //common file sequence 
    async getFileSequenceCommon() {
        const filePayload = {
            woid: this.clientUtility.activityDetails.workOrderId,
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        let fileSeqData = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getFileSequence}`, filePayload, headers);
        let fileSeq = fileSeqData.data.sort((a, b) => a.filesequence - b.filesequence);

        let fileSeqCont = '{';
        fileSeq.map((file) => {
            fileSeqCont += `"${file.filename}" : ${file.filesequence},\n`
        })
        fileSeqCont += `}`;
        return fileSeqCont;
    }

    // added by vaithi
    async checkZipFolderStructure(folderPath) {
        const fs = require('fs');
        const JSZip = require('jszip');

        // Path to the zip file
        const zipFilePath = folderPath;

        // Read the zip file
        fs.readFile(zipFilePath, function (err, data) {
            if (err) {
                console.error('Error reading zip file:', err);
                return;
            }

            // Load the zip file data into JSZip
            JSZip.loadAsync(data).then(function (zip) {

                let folderCount = 0;
                Object.keys(zip.files).forEach(filename => {
                    if (filename.endsWith('/')) {
                        folderCount++;
                    }
                });
                return folderCount;

            }).catch(function (err) {
                console.error('Error loading zip file:', err);
            });
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
        this.clientUtility.activityDetails.placeHolders.localworkingfolder = this.clientUtility.pathDetails.client.path
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
            issuemstid: this.clientUtility.activityDetails.issuemstid,
            isonlineissue: this.clientUtility.activityDetails.isonlineissue,
            ismscompleted: this.clientUtility.activityDetails.ismscompleted,
            activitymodeltypeflow: this.clientUtility.activityDetails.activitymodeltypeflow,
            wfDefId: this.clientUtility.activityDetails.wfDefId,
            fileTypeId: this.clientUtility.activityDetails.fileType.id,
            isOtherArticle: this.clientUtility.activityDetails.isOtherArticle,
            articleOrderSequence: this.clientUtility.activityDetails.articleOrderSequence,
            iscamundaflow: this.clientUtility.activityDetails.iscamundaflow,
            isDownload: true
        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, filesAdditionalInfo, validationFileConfig } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
        if (filesAdditionalInfo?.extractedFiles.length > 0) {
            this.filesInfo.extractedFiles = filesAdditionalInfo?.extractedFiles.filter(file => (file.fileFlowType || []).filter(x => x.toLocaleLowerCase() === "in").length > 0)
            // this.filesInfo.extractedFiles  =filesAdditionalInfo?.extractedFiles
        }

    }

    preProcessing(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await preProcessing(this.filesInfo, this.clientUtility, this.action, 'copylinkingfile');
                await this.clientUtility.updateStatusToServer({ message: 'Pre Processing Ended', progress: 40 }, 2);
                // await this.fetchDetails(payload);
                resolve();
            } catch (err) {
                reject(err)
            }
        });
    }

    async createFileTypeFolders() {
        // lwf changes for cup
        // if(Object.keys(this.clientUtility.activityDetails.customer).length >0 && this.clientUtility.activityDetails.customer.id != '1'){
        //     for (let i = 0; i < this.filesInfo.data.length; i++) {
        //         var isskipp =false;
        //         const { name: fileTypeName } = this.filesInfo.data[i];
        //         const folder = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
        //     this.clientUtility.activityDetails.fileConfig.fileTypes[this.filesInfo.data[i].typeId].files.length >0 && this.clientUtility.activityDetails.fileConfig.fileTypes[this.filesInfo.data[i].typeId].files.map((list) =>{
        //         if(list.isSkipFolderCreation){
        //             isskipp = true
        //         }
        //     })
        //        if(isskipp == false){
        //         if (!isPathExist(folder)) await makeDir(folder);
        //        }
        //        else{
        //         global.log("folder is empty")
        //        }
        //     }
        // }
        this.explorerPath = this.clientUtility.pathDetails.client.path;

        for (let i = 0; i < this.filesInfo.data.length; i++) {
            if (this.clientUtility.activityDetails.validationFileConfig[this.filesInfo.data[i].typeId]) {
                let files = this.clientUtility.activityDetails.validationFileConfig[this.filesInfo.data[i].typeId].files
                for (let j = 0; j < files.length; j++) {
                    if (files[j].custom) {
                        if (files[j].custom && files[j].custom.createFolder) {
                            const dirFolder = extendedJoin([this.clientUtility.pathDetails.client.path, files[j].custom.name, '/']);
                            if (!isPathExist(dirFolder)) await makeDir(dirFolder);
                        }
                    }
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
            const { uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isFolder, folderName, path } = file;
            const localPath = extendedJoin([folderStructureWithRoot, file.path.replace(okmFolderStructure, '')]);


            const folderPath = isFolder && folderName && folderRelativePath ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(this.clientUtility.pathDetails.okm.path, '')]) : folderStructureWithRoot;
            const isExist = isPathExist(localPath);
            const relativeSrc = extendedJoin([localPath], false).replace(this.clientUtility.pathDetails.client.path, '');
            var alternativeNewFileName = lwfDetails && Object.keys(lwfDetails).includes('newName') && lwfDetails.newName != "" ? lwfDetails.newName : ""
            var isRomanNameRequired = lwfDetails && Object.keys(lwfDetails).includes('isRoman') ? lwfDetails.isRoman : ""
            let isInput = lwfDetails && Object.keys(lwfDetails).includes('isInputFile') ? lwfDetails.isInputFile : false;
            const fileDetails = { name: basename(localPath), path, relativeSrc, folderPath: folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite, newName: alternativeNewFileName, isRoman: isRomanNameRequired, isInputFile: isInput };
            this.explorerPath = folderPath;
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
            let awt = [];
            const filteredFiles = files.filter((file) => file.isFolder && file.folderName == this.filesInfo.folderName);
            for (let j = 0; j < filteredFiles.length; j++) {
                awt.push(fetchFiledetailsFun(filteredFiles, j, folderStructureWithRoot, okmFolderStructure, this, filesData.incomingFileId));
            }
            await Promise.all(awt);
            this.explorerPath = this.clientUtility.pathDetails.client.path;
        } else {
            for (let i = 0; i < this.filesInfo.data.length; i++) {
                const { name: fileTypeName, basePath, incomingFileId, typeId, files } = this.filesInfo.data[i];
                const folderStructure = extendedJoin([this.clientUtility.pathDetails.client.path, fileTypeName, '/']);
                const folderStructureWithRoot = extendedJoin([this.clientUtility.pathDetails.client.path, '/']);
                const okmFolderStructure = basePath;
                let awt = [];
                for (let j = 0; j < files.length; j++) {
                    awt.push(fetchFiledetailsFun(files, j, folderStructureWithRoot, okmFolderStructure, this, incomingFileId));
                }
                await Promise.all(awt);
            }
            this.explorerPath = this.clientUtility.pathDetails.client.path;
        }

        async function fetchFiledetailsFun(files, j, folderStructureWithRoot, okmFolderStructure, _this, incomingFileId) {
            const file = files[j];
            const { path, uuid, actfilemapid, isReadOnly, lwfDetails, overwrite, isFolder, folderName, folder } = file;
            let { folderRelativePath } = file;
            const localPath = extendedJoin([folderStructureWithRoot, path.replace(okmFolderStructure, '')]);
            if (_this.clientUtility.activityDetails.activitymodeltypeflow && (_this.clientUtility.activityDetails.activitymodeltypeflow == 'Batch' || _this.clientUtility.activityDetails.activitymodeltypeflow == 'Partial')) {
                let Out = "";
                if (path.includes(incomingFileId)) {
                    let Arr = path.split(incomingFileId)[1].split("/");
                    console.log(Arr);
                    Arr.filter((data) => data !== "").map((data, index) => {
                        if (!data.includes(".")) {
                            Out += index !== 0 || index === Arr.filter((data) => data !== "").length - 1 ? `/${data}` : data
                        }
                    });
                    folderRelativePath = Out
                } else {
                    folderRelativePath = Out
                }
            }
            const folderPath = isFolder && folderName && folderRelativePath ? extendedJoin([folderStructureWithRoot, folderRelativePath]) : isFolder && folderName == '' && folderRelativePath != '' ? extendedJoin([folderStructureWithRoot, folderRelativePath.replace(_this.clientUtility.pathDetails.okm.path, '')]) : folderStructureWithRoot;
            const isExist = isPathExist(localPath);
            const relativeSrc = extendedJoin([localPath], false).replace(_this.clientUtility.pathDetails.client.path, '');
            let alternativeNewFileName = lwfDetails && Object.keys(lwfDetails).includes('newName') && lwfDetails.newName != "" ? lwfDetails.newName : "";
            let isRomanNameRequired = lwfDetails && Object.keys(lwfDetails).includes('isRoman') ? lwfDetails.isRoman : "";
            let isInput = lwfDetails && Object.keys(lwfDetails).includes('isInputFile') ? lwfDetails.isInputFile : false;
            const fileDetails = { name: basename(localPath), path, relativeSrc, folderPath, uuid, actFileMapId: actfilemapid, isReadOnly, overwrite, newName: alternativeNewFileName, isRoman: isRomanNameRequired, isInputFile: isInput };
            if (!isExist) {
                _this.fileStatus.download.push(fileDetails);
            } else {
                if (overwrite) {
                    let srcChecksum = undefined;
                    let okmChecksum = undefined;
                    let awt = [];
                    awt.push(getChecksum(localPath).then(val => { srcChecksum = val; }).catch(err => { }));
                    switch (_this.clientUtility.activityDetails.dmsType) {
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
                        _this.fileStatus.downloaded.push(fileDetails);
                    } else {
                        _this.fileStatus.download.push(fileDetails);
                    }
                } else {
                    _this.fileStatus.downloaded.push(fileDetails);
                }
            }
        }
    };

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
                    let awt = [];
                    let FileToDownload = this.fileStatus.download.filter(file => {
                        if ((this.clientUtility.activityDetails.config.skipFileExtension || []).length > 0 || (this.clientUtility.activityDetails.config.allowedFileExtension || []).length > 0 || (this.clientUtility.activityDetails.config.skipFiles || []).length > 0 ) {
                            let skipFileExtension = this.clientUtility.activityDetails.config.skipFileExtension ? (this.clientUtility.activityDetails.config.skipFileExtension.filter((data) => extname(file.name) == ('.' + data)).length > 0 ? true : false) : false;
                            let skipFiles ; 
                            if((this.clientUtility.activityDetails.stage.name == 'Revises') && (this.clientUtility.activityDetails.stage.id == '2') &&
                            (this.clientUtility.activityDetails.stage.iteration != '1') &&  (this.clientUtility.activityDetails.du.name == 'WKH Journal') &&
                            (this.clientUtility.activityDetails.du.id == '12') &&  (this.clientUtility.activityDetails.wfId == '31')){
                                skipFiles  =  this.clientUtility.activityDetails.config.skipFiles ? (this.clientUtility.activityDetails.config.skipFiles.filter((data) => data.includes(';') ? file.name == getFormattedName(data,this.clientUtility.activityDetails.placeHolders) : file.name == data).length > 0 ? true : false) : false;

                            }else{

                                if((this.clientUtility.activityDetails.stage.name == 'Revises') && (this.clientUtility.activityDetails.stage.id == '2') &&
                                (this.clientUtility.activityDetails.stage.iteration == '1') &&  (this.clientUtility.activityDetails.du.name == 'WKH Journal') &&
                                (this.clientUtility.activityDetails.du.id == '12') &&  (this.clientUtility.activityDetails.wfId == '31')){
                                    skipFiles = false;
                                }
                                else{
                                    skipFiles  =  this.clientUtility.activityDetails.config.skipFiles ? (this.clientUtility.activityDetails.config.skipFiles.filter((data) => data.includes(';') ? file.name == getFormattedName(data,this.clientUtility.activityDetails.placeHolders) : file.name == data).length > 0 ? true : false) : false;

                                }

                            } let allowedFileExtension = this.clientUtility.activityDetails.config.allowedFileExtension && this.clientUtility.activityDetails.config.allowedFileExtension.length > 0 ? (this.clientUtility.activityDetails.config.allowedFileExtension.filter((data) => file.name.includes(data)).length > 0 ? true : false) : true;
                            if (skipFileExtension || !allowedFileExtension || skipFiles) {
                                return false;
                            }
                            else {
                                return true;
                            }
                        }
                        else {
                            return true;
                        }
                    });
                    const limit = pLimit(10);
                    // FileToDownload = FileToDownload.filter((list) => list.path.includes('/'))
                    for (let i = 0; i < FileToDownload.length; i++) {
                        awt.push(limit(() => DownloadFiles(FileToDownload[i], this)));
                    }
                    await Promise.all(awt);
                }
                if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloaded Files', progress: 80 }, 2);

                async function DownloadFiles(file, _this) {
                    return new Promise(async (resolve, reject) => {
                        try {
                            await _this.updateDownloadProgressDetails(file, progressDetails, true);
                            await _this.downloadFile(file);
                            // to be handled
                            // if(_this.clientUtility.firstTimeWip && file.isInputFile){
                            //     await _this.deleteSnapChatForFirstWip (file,_this.clientUtility.activityDetails.dmsType)
                            // }
                            await _this.updateDownloadProgressDetails(file, progressDetails, false);
                            resolve();
                        } catch (error) {
                            reject(error)
                        }
                    })

                }
                resolve()
            } catch (e) {
                reject(e)
            }
        })
    }
    async deleteSnapChatForFirstWip(sourceDetails, dmsType) {
        return new Promise(async (resolve, reject) => {
            try {
                if (Object.keys(sourceDetails).length > 0 && sourceDetails.path != '') {
                    switch (dmsType) {
                        case "azure":
                            let encodedURL = encodeURI(sourceDetails.path);
                            encodedURL.replace(/%20/g, ' ').replace(/%25/g, ' ');
                            await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.DeleteBlobSnapshort}?docPath=${encodedURL}`);
                            break;
                        case "local":
                            // to be hanlded in local
                            // await get(`${APIConfig.azure.getBaseURL()}${APIConfig.azure.url.DeletelocalSnapshort}?docPath=${sourceDetails.path}`);
                            break;
                        default:
                            break;
                    }
                    resolve()
                } else {
                    resolve()
                }

            } catch (e) {
                global.log('error in restoring the files')
                reject(e)
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
                const { folderPath, name, uuid, newName, isRoman, path } = fileData;
                var ext = extname(name)
                var romanString
                let pattern = /[XMLIV]+/gm
                var ext = extname(name)
                var fileName = name.replace(ext, "")
                var isValidRoman = pattern.test(fileName)
                if (isRoman) {
                    var array1 = name.split('_')
                    var arraylen = name.replace(ext, "")
                    romanString = array1.length > 0 ? array1[0] + '_p' : name
                    var array = array1.length > 0 ? array1[1].split('-') : name
                    let awt = [];
                    array.forEach(async (list, k) => {
                        awt.push(RenameAsRoman(list, k, this, name));
                    })
                    await Promise.all(awt);
                }
                console.log(romanString, "romanString")
                var romstrg = isValidRoman ? fileName : isRoman ? romanString : name
                var newName1 = isRoman && ext ? romstrg + ext : newName && ext ? newName + ext : ""
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        await azureHelper.downloadFile(path, folderPath, newName1 && newName1 != '' ? newName1 : name)
                        break;
                    case "local":
                        if (os.platform() == "win32" && isInternalConnection) {
                            await localHelper.downloadLocalFileWithImpersonator(path, folderPath, newName1 && newName1 != '' ? newName1 : name, this.clientUtility)
                        }
                        else {
                            await localHelper.downloadlocalFile(path, folderPath, newName1 && newName1 != '' ? newName1 : name)
                        }
                        break;
                    default:
                        await okmHelper.downloadFile(uuid, folderPath, newName1 && newName1 != '' ? newName1 : name);
                        break;
                }
                async function RenameAsRoman(list, k, _this, name) {
                    let r = list.match(/\d+/g);
                    if (r) {
                        console.log(parseInt(r[0]), "okkk");
                        let result = await _this.convertNormalToRomanNumbers(parseInt(r[0]));
                        console.log(result, "result");
                        if (result) {
                            romanString += array.length - 1 != k ? result + '-' : result
                        } else {
                            name
                        }
                    } else {
                        name
                    }
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        })

    }

    async convertNormalToRomanNumbers(name) {
        if (typeof name !== 'number')
            return false;
        var digits = String(+name).split(""),
            key = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM",
                "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC",
                "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"],
            roman_num = "",
            i = 3;
        while (i--)
            roman_num = (key[+digits.pop() + (i * 10)] || "") + roman_num;
        return Array(+digits.join("") + 1).join("M") + roman_num;
    }

    async validate() {
        this.validateMissingFiles();
        // await this.validateProcess();
    }

    validateMissingFiles() {
        if (this.fileStatus.mandatoryInFiles.length) {
            const missingFilesMessage = this.fileStatus.mandatoryInFiles.map(file => {
                // Simply return the file name
                return basename(file.name) || 'Unknown Name';
            }).join(', ');

            throw `Following mandatory files are missing in storage. Please contact IWMS administrator:\n ${missingFilesMessage}`;
        }
    }


    async mandatoryInFileCheck(unOptionalFiles) {
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

    }

    async constructDownloadPayload() {
        return new Promise( async (resolve, reject) => {
            try {
                const getLatestFolderFiles = async (folderInput) => {
                    const wfId = this.clientUtility.activityDetails.wfId; 
                    const workOrderId = this.clientUtility.activityDetails.workOrderId;
                    let filteredFolderFiles = [];
                    for (const file of folderInput) {
                        if(file.copydetail.length > 1){
                            const latestIndex = await this.getLatestStageActivity( wfId, workOrderId, file.copydetail);
                            if(latestIndex >= 0){
                                file.copydetail = [file.copydetail[latestIndex]];
                                file.copyPaths = [file.copyPaths[latestIndex]];
                            }
                            filteredFolderFiles.push(file);
                        }else{
                            filteredFolderFiles.push(file)
                        }
                    }
                    return filteredFolderFiles;
                };

            const folderFiles = await getLatestFolderFiles(this.filesInfo?.extractedFiles.filter(list => !list.isFile)) || [];

            const files = await getLatestFolderFiles(this.filesInfo?.extractedFiles.filter(list => list.isFile)) || [];

            const filesDownloadList = [];
            const filesAlreadyDownloadedList = [];
            let newbaseName='';
            const addFileToLists = async (sourcePath, destPath, isLocal) => {
                let isFileAlreadyPresent = isLocal
                    ? isPathExist(destPath)
                    : await azureHelper.isFileExist(destPath);

                if (isFileAlreadyPresent) {
                    filesAlreadyDownloadedList.push({
                        path: sourcePath,
                        uuid: this.clientUtility.activityDetails.dmsType,
                        folderPath: path.dirname(destPath) + '\\',
                        name: path.basename(destPath)
                    });
                } else {
                    filesDownloadList.push({
                        path: sourcePath,
                        uuid: this.clientUtility.activityDetails.dmsType,
                        folderPath: path.dirname(destPath) + '\\',
                        name: path.basename(destPath)
                    });
                }
            };

            for (const file of files) {
                const isLocal = this.clientUtility.activityDetails.dmsType === 'local';
               let isPattern=   file.name.includes('*')
               if(isPattern){
               let  newFile =await retreiveFiles(file.name)
                file.copyPaths[0].sourcepath=newFile[0]
                newbaseName =file.copyPaths[0].destpath.includes('*')  ? newFile[0] : file.copyPaths[0].destpath
                file.copyPaths[0].destpath = join(path.dirname(file.copyPaths[0].destpath), basename(newbaseName))
               }           
                for (const copyInfo of file.copyPaths) {
                    const isFileExists = isLocal
                        ? await localHelper.islocalFileExist(copyInfo.sourcepath)
                        : await azureHelper.isFileExist(copyInfo.sourcepath);

                    if (isFileExists?.islocalFileExist) {
                        await addFileToLists(copyInfo.sourcepath, copyInfo.destpath, isLocal);
                        break; // Stop checking further once a file is found
                    }
                }
            }

            for (const folderFile of folderFiles) {
                for (const copyInfo of folderFile.copyPaths) {
                    const isLocal = this.clientUtility.activityDetails.dmsType === 'local';
                    const files = isLocal
                        ? await getRetreivelocalFilesURL(copyInfo.sourcepath)
                        : await getRetreiveBlobFilesURL(copyInfo.sourcepath);

                    const filteredFiles = files.filter(list => {
                        const ext = path.extname(list.path).toLowerCase().slice(1);
                        return (!folderFile.skipExt.includes(ext) &&
                            (folderFile.allowExt.length === 0 || folderFile.allowExt.includes(ext)));
                    });

                    for (const file of filteredFiles) {
                        // const destPath = path.join(copyInfo.destpath, path.basename(file.path)).replace(/\//g, '\\');
                        const relativeFilePath = file.path.replace(copyInfo.sourcepath, '').replace(/\//g, '\\');
                        // Construct the destination path by keeping the folder structure
                        const destPath = path.join(copyInfo.destpath, relativeFilePath);
                        await addFileToLists(file.path, destPath, isLocal);
                    }

                    if (filteredFiles.length > 0) break; // Stop checking further once a file is found
                }
            }

            this.fileStatus.download = filesDownloadList;
            this.fileStatus.downloaded = filesAlreadyDownloadedList;
            resolve(true);
            } catch(err) {
                reject(err);
            }
            
        });
    }

    async getLatestStageActivity(wfId, workorderId, stgActyInfo) {
        return new Promise( async (resolve, reject) => {
            try {
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getlateststgacty}`, {wfId, workorderId, stgActyInfo}, headers);
                resolve (result);
            } catch (error) {
                global.log(error.message || JSON.stringify(error), 'getLatestStageActivity');
                reject (error.message || JSON.stringify(error));
            }
        })
    }

}

module.exports = {
    OpenExporer
};
