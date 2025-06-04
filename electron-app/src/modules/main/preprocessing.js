const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { extendedJoin, readSmallFile, getFormattedName, stat, isPathExist, readDir, isDirExist, getFileTypeFolderStructure, getFormattedGraphicPath, isFileExistOKM, createFileTypeFolderStructure, rename, createFolder, retreiveLocalFiles, getRevisedFileInfoE2E } = require('../utils/io');
const { post } = require('../http/index');
const { generateJobInfoXml } = require('../custom/jobinfoxml')
const { updateLatestTemplateFileForWoid } = require('../custom/templateuploder');
const okmHelper = require('../utils/okm');
const { getIncomingFileTypeDetails } = require('../../modules/main/postProcessing/onSaveValidation')
const { extname, basename, dirname, join } = require('path');
const pLimit = require('p-limit');
const limit = pLimit(75);
const { GetAllFiles } = require('../utils/process');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { getRetreiveBlobFilesURL } = require("../utils/azure.js");
const os = require('os');
const { extractZip } = require('../main/postProcessing/tools')
const fs = require("fs");


const preProcessing = (filesInfo, clientUtility, action, type) => {
    return new Promise(async (resolve, reject) => {
        try {
            clientUtility.filesDownload = []
            await clientUtility.updateStatusToServer({ message: 'Pre Processing - Validating files', progress: 45 }, 2);
            await validateTextFile(filesInfo, clientUtility, action, type);
            await downloadFiles(clientUtility);
            resolve();
        } catch (err) {
            reject(err)
        }
    })
}

downloadFiles = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            let awt = [];
            const _limit = pLimit(10);
            let FileToDownload = clientUtility.filesDownload.filter(file => {
                if ((clientUtility.activityDetails.config.skipFileExtension || []).length > 0 || (clientUtility.activityDetails.config.allowedFileExtension || []).length > 0) {
                    let skipFile = clientUtility.activityDetails.config.skipFileExtension ? (clientUtility.activityDetails.config.skipFileExtension.filter((data) => file.name.includes(data)).length > 0 ? true : false) : false;
                    let allowedFileExtension = clientUtility.activityDetails.config.allowedFileExtension && clientUtility.activityDetails.config.allowedFileExtension.length > 0 ? (clientUtility.activityDetails.config.allowedFileExtension.filter((data) => file.name.includes(data)).length > 0 ? true : false) : true;
                    if (skipFile || !allowedFileExtension) {
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

            FileToDownload.forEach(async (ele) => {
                switch (clientUtility.activityDetails.dmsType) {
                    case 'azure':
                        awt.push(_limit(() => azureHelper.downloadFile(ele.srcPath, ele.destBasePath, ele.name)));
                        break;
                    case 'local':
                        // awt.push(_limit(() => localHelper.downloadlocalFile(ele.srcPath, ele.destBasePath, ele.name)));
                        awt.push(_limit(() => localHelper.downloadLocalFileWithImpersonator(ele.srcPath, ele.destBasePath, ele.name, this.clientUtility)));
                        break;
                    default:
                        awt.push(_limit(() => okmHelper.downloadFile(ele.src, ele.destBasePath, ele.name)));
                        break;
                }
            });
            await Promise.all(awt);
            resolve();
        } catch (error) {
            reject(error);
        }
    })
}


validateTextFile = (filesInfo, clientUtility, action, type) => {
    return new Promise(async (resolve, reject) => {
        try {
            if(clientUtility.activityDetails.iscamundaflow){
            if (type == 'copylinkingfile') {
                // if(clientUtility.activityDetails.config && Object.keys(clientUtility.activityDetails.config).length > 0 && clientUtility.activityDetails.config.actions && clientUtility.activityDetails.config.actions.general && clientUtility.activityDetails.config.actions.general.graphic && clientUtility.activityDetails.config.actions.general.graphic.graphicText && clientUtility.activityDetails.config.actions.general.graphic.graphicImage){
                //     var { retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicText(clientUtility, clientUtility.activityDetails.config.actions.general.graphic);
                //     const retreievesourceFileListFig = retrieveSourceFileList
                //     var { retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicImage(clientUtility, clientUtility.activityDetails.config.actions.general.graphic);
                //     const retreievesourceFileListImg = retrieveSourceFileList
                //     if (retreievesourceFileListFig && retreievesourceFileListFig.length > 0 )   {
                //         var resultForGraphics = await graphicSaveForActivities(clientUtility, retreievesourceFileListFig, fileterdDetailsName, "text", fileDetailsInIncoming, "graphicText")
                //         console.log(resultForGraphics, "resultForGraphics")
                //     }
                //     if(retreievesourceFileListImg && retreievesourceFileListImg.length > 0){
                //         var resultForGraphics = await graphicSaveForActivities(clientUtility, retreievesourceFileListImg, fileterdDetailsName, "image", fileDetailsInIncoming, "graphicImage")
                //         console.log(resultForGraphics, "resultForGraphics")
                //     }
                // }
                // else if (clientUtility.activityDetails.config && Object.keys(clientUtility.activityDetails.config).length > 0 && clientUtility.activityDetails.config.actions && clientUtility.activityDetails.config.actions.general && clientUtility.activityDetails.config.actions.general.graphic && clientUtility.activityDetails.config.actions.general.graphic.graphicText) {
                //     var { retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicText(clientUtility, clientUtility.activityDetails.config.actions.general.graphic);
                //     if (retrieveSourceFileList && retrieveSourceFileList.length > 0) {
                //         var resultForGraphics = await graphicSaveForActivities(clientUtility, retrieveSourceFileList, fileterdDetailsName, "text", fileDetailsInIncoming, "graphicText")
                //         console.log(resultForGraphics, "resultForGraphics")
                //     }
                // } else if (clientUtility.activityDetails.config && Object.keys(clientUtility.activityDetails.config).length > 0 && clientUtility.activityDetails.config.actions && clientUtility.activityDetails.config.actions.general && clientUtility.activityDetails.config.actions.general.graphic && clientUtility.activityDetails.config.actions.general.graphic.graphicImage) {
                //     var { retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicImage(clientUtility, clientUtility.activityDetails.config.actions.general.graphic);
                //     if (retrieveSourceFileList && retrieveSourceFileList.length > 0) {
                //         if (clientUtility.activityDetails.fileType.id != null) {
                //             // based on type passing the retreievesourceFileDetails so type is marked it as image..
                //             var resultForGraphics = await graphicSaveForActivities(clientUtility, retrieveSourceFileList, fileterdDetailsName, "image", fileDetailsInIncoming, "graphicImage")
                //         } else {
                //             var resultForGraphics = await graphicSaveForActivities(clientUtility, retrieveSourceFileList, fileterdDetailsName, "text", fileDetailsInIncoming, "graphicImage")

                //         }
                //         console.log(resultForGraphics, "resultForGraphics")
                //     }
                // }
                // jobsheet file copy for spring from srcPath : prodrepository/springer_9/springer_10/1076/typesetting_1/Incoming/article_4/2470/jobsheet.xml 
                // if (clientUtility.activityDetails.config && Object.keys(clientUtility.activityDetails.config).length > 0 && Object.keys(clientUtility.activityDetails.config).includes('GenerateJobSheetDetails') && clientUtility.activityDetails.config.GenerateJobSheetDetails) {
                //     var copyJobSheetFile = await jobSheetFileCopy(clientUtility);
                //     console.log(copyJobSheetFile, "copyJobSheetFile")
                // }
            }
            let awaits = [];
            let isJobSheetCopied = false;
            filesInfo.data.forEach((element, i) => {
                if (clientUtility.activityDetails.validationFileConfig[element.typeId]) {
                    let files = clientUtility.activityDetails.validationFileConfig[element.typeId].files
                    if (action == "save") {
                        files.filter((x) => x.latestFileCheck !== undefined)
                            .forEach((ele) => {
                                awaits.push((async () => {
                                    await fileValidation(ele, clientUtility, element);
                                })());
                            });
                    }
                    let GenerateJobSheetDetails = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "generatejobsheetdetails").length > 0);
                    let iautopagination = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "iautopagination").length > 0);
                    let imageCopy = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copygraphicsfile").length > 0);
                    let imagePrintCopy = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copygraphicsprintfile").length > 0);
                    let imagetext = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copygraphicstext").length > 0);
                    let generate_jobinfo = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "generate_jobinfo").length > 0);
                    let template = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "template").length > 0);
                    let copyPageTarget = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copypagetarget").length > 0);
                    let copyCommonFolderPath = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copycommonfolderpath").length > 0);
                    let copyRevisedFileE2E = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copyrevisedfilee2e").length > 0);
                    let copyBookFilesFromOtherStage = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copystage50file").length > 0);
                    let copyReferenceFilesFromOtherStage = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copystage50reffile").length > 0);
                    let copyblobfiletoZipFile = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "blobfiletozipfile").length > 0);



                    if (iautopagination.length > 0) {
                        awaits.push((async () => {
                            copyFile(clientUtility)
                        })());
                    }
                    if (GenerateJobSheetDetails.length > 0) {
                        if (isJobSheetCopied == false) {
                            isJobSheetCopied = true;
                            awaits.push((async () => {
                                await jobSheetFileCopy(clientUtility, GenerateJobSheetDetails);
                            })());
                        }
                    }
                    if (imageCopy.length > 0) {
                        awaits.push((async () => {
                            if(Object.keys(imageCopy[0]).includes('isgraphicpath') && imageCopy[0].isgraphicpath){
                                await graphicsFilesDownloadLocal(clientUtility,imageCopy[0]);
                            }else if(imageCopy[0].name.endsWith('.zip')){
                                const { retrieveSourceFileList } = await getGraphicStageActivityDetailsForGraphicImage(clientUtility, imageCopy[0]);
                                const sourceInfo = retrieveSourceFileList.filter(item => {
                                    const pathFileName = basename(item.path);
                                    const folderFileName = basename(item.folderName);
                                    return pathFileName === folderFileName;
                                  });

                                if(sourceInfo.length == 0){
                                    // throw `Graphics images Zip file is missing. Please contact WMS Admin.`;
                                    console.log(`Graphics images Zip file is missing. Please contact WMS Admin.`);
                                    return
                                }
                                const { path: sourcePath } = sourceInfo[0];
                                const destPath = join(clientUtility.pathDetails.client.path, await getFormattedName(sourceInfo[0].folderName, clientUtility.activityDetails.placeHolders));
                                await localHelper.downloadlocalFile(sourcePath, dirname(destPath), basename(destPath));
                                if (fs.existsSync(destPath)) {
                                    try{
                                        await extractZip(destPath, false)
                                        fs.unlinkSync(destPath)
                                    }catch (err){
                                        console.log('Graphics image zip issue ', err)
                                    }
                                }
                            }else {
                                const { retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicImage(clientUtility, imageCopy[0]);
                                console.log(retrieveSourceFileList, 'retreievesourceFileListImg1')
                                if (retrieveSourceFileList && retrieveSourceFileList.length > 0)
                                    console.log(retrieveSourceFileList, 'retreievesourceFileListImg2')
                                await graphicSaveForActivities(clientUtility, retrieveSourceFileList, fileterdDetailsName, "image", fileDetailsInIncoming, "graphicImage");
                            }
                        })());
                    }
                    if (imagePrintCopy.length > 0) {
                        awaits.push((async () => {
                            if(Object.keys(imagePrintCopy[0]).includes('isgraphicpath') && imagePrintCopy[0].isgraphicpath){
                                await graphicsFilesDownloadLocal(clientUtility,imagePrintCopy[0],true);
                            }
                            if(imagePrintCopy[0].isCopyImages){
                                const { retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicImage(clientUtility, imagePrintCopy[0]);
                                if (retrieveSourceFileList && retrieveSourceFileList.length > 0)
                                await graphicSaveForActivities(clientUtility, retrieveSourceFileList, fileterdDetailsName, "image", fileDetailsInIncoming, "graphicImage");
                            }
                        })());
                    }
                    if (copyblobfiletoZipFile.length > 0 && filesInfo.isFileCopy) {
                        copyblobfiletoZipFile.map(x=>{     
                        awaits.push((async () => {
                           let result= await blobFilestoZipDownloadLocal(clientUtility,x);
                           if(result.isSuccess)
                           {
                            await extractZip(result.filePath, false).catch(err => console.log(err));
                           }
                    })());
                   })
                    }
                    if (imagetext.length > 0) {
                        awaits.push((async () => {
                            const { retreievesourceFileListImg, fileterdDetailsName, fileDetailsInIncoming } = await getGraphicStageActivityDetailsForGraphicText(clientUtility, imagetext[0].customwfdefid);
                            if (retreievesourceFileListImg && retreievesourceFileListImg.length > 0)
                                await graphicSaveForActivities(clientUtility, retreievesourceFileListImg, fileterdDetailsName, "text", fileDetailsInIncoming, "graphicText");
                        })());
                    }
                    if (generate_jobinfo.length > 0) {
                        generate_jobinfo.forEach(ele => {
                            awaits.push((async () => {
                                await generateJobInfoXml(clientUtility, ele.name, element)
                            })());
                        });
                    }
                    if (template.length > 0) {
                        awaits.push((async () => {
                            await updateTemplateFile(element, clientUtility, action, type)
                        })());
                    }

                    if (copyPageTarget.length > 0) {
                        let _copyPageTarget = copyPageTarget.filter(x => x.fileFlowType.includes("IN"))
                        let _uplodPageTarget = copyPageTarget.filter(x => x.fileFlowType.includes("OUT"))
                        if (_copyPageTarget && _copyPageTarget.length > 0) {
                            let folderName = copyPageTarget[0].name.replace('/**/*', '')
                            let dest = `${clientUtility.pathDetails.client.path}/${folderName}/`
                            if (!isPathExist(dest)) {
                                awaits.push((async () => {
                                    await copyPageTargetFolder(clientUtility, copyPageTarget)
                                })());
                            }
                        }

                        if (_uplodPageTarget && _uplodPageTarget.length > 0) {
                            if (action == "save") {
                                awaits.push((async () => {
                                    await uploadPageTargetFolder(clientUtility, copyPageTarget)
                                })());
                            }
                        }

                    }

                    if (copyCommonFolderPath.length > 0) {
                        awaits.push((async () => {
                            await copyNewCommonFolderPath(clientUtility, copyCommonFolderPath)
                        })());
                    }

                    if (copyRevisedFileE2E.length > 0) {
                        awaits.push((async () => {
                            await copyRevisedFilesToServer(clientUtility, copyRevisedFileE2E)
                        })())
                    }


                    if (copyBookFilesFromOtherStage.length > 0) {
                        awaits.push((async () => {
                            await copyBookFilesFromStage50(clientUtility, copyBookFilesFromOtherStage);
                        })());

                    }
                    if (copyReferenceFilesFromOtherStage.length > 0) {
                        awaits.push((async () => {
                            await copyReferenceFileFromStage50(clientUtility, copyBookFilesFromOtherStage);
                        })());

                    }



                    let isRoman = [], copylinkingdocx1 = [], page_range = [];
                    //copyFile = [], copyPageTarget = [], copyentfile = [],
                    switch (type) {
                        case 'copylinkingfile':
                            copylinkingdocx1 = [...Object.keys(clientUtility.activityDetails.validationFileConfig).map(x => clientUtility.activityDetails.validationFileConfig[x].files)].flat().filter(file => {
                                let custom = (file.custom || []).filter(x => x.split("::")[0].toLocaleLowerCase() === "copylinkingdocx1");
                                if (custom.length > 0) {
                                    let ids = custom[0].split("::")
                                    file.srcwfdefid = ids[1]
                                    file.wordidwfdefid = ids[2]
                                    file.incwfdefid = ids[3]
                                    return true;
                                } else {
                                    return false;
                                }
                            });
                            copyentfile = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "copyentfile").length > 0);
                            //copyFileCustom = files.filter(file => (file.custom||[]).filter(x=>x.toLocaleLowerCase() === "copyfile").length > 0);
                            isRoman = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "isroman").length > 0);
                            isRoman.forEach(ele => {
                                awaits.push((async () => {
                                    await updateRomanNumberFileName(ele.name, element, true, clientUtility, "roman");
                                })());
                            })
                            if (copylinkingdocx1.length > 0) {
                                copylinkingdocx1.forEach(file => {
                                    awaits.push((async () => {
                                        await copyLinkingDocxFileToPreEditingActivity(clientUtility, file.srcwfdefid, file.wordidwfdefid, file.incwfdefid)
                                    })());
                                });
                            }
                            break;
                        case 'sync':
                            isRoman = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "isroman").length > 0);
                            page_range = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "page_range").length > 0
                                && ((file.mandatoryCheck || {})[action] || (file.custom || []).filter(x => x.toLocaleLowerCase() === "isroman").length > 0));
                            isRoman.forEach(ele => {
                                awaits.push((async () => {
                                    await updateRomanNumberFileName(ele.name, element, true, clientUtility, "number");
                                })());
                            });
                            page_range.forEach(ele => {
                                awaits.push((async () => {
                                    let data = await readFileContent(ele.name, i, clientUtility, filesInfo);
                                    if (data && data.length > 0) {
                                        await updateNewFileName(data, element.incomingFileId,clientUtility);
                                        clientUtility.updateFileDetails = true;
                                    }

                                })());
                            });
                            break;
                        case 'synctool':
                            page_range = files.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "page_range").length > 0);
                            page_range.forEach(ele => {
                                awaits.push((async () => {
                                    let data = await readFileContent(ele.name, i, clientUtility, filesInfo);
                                    if (data && data.length > 0) {
                                        await updateNewFileName(data, element.incomingFileId,clientUtility);
                                        clientUtility.updateFileDetails = true;
                                    }
                                })());
                            });
                        default:
                            break;
                    }
                    // files.forEach((ele, j) => {
                    //     // for (let j = 0; j < files.length; j++) {
                    //     if (ele.custom) {
                    //         if (type == 'copylinkingfile') {
                    //             if (ele.custom && ele.custom.copylinkingdocx1) {
                    //                 awaits.push((async () => {
                    //                     await copyLinkingDocxFileToPreEditingActivity(clientUtility, ele.custom.copylinkingdocx1.srcwfdefid, ele.custom.copylinkingdocx1.wordidwfdefid, ele.custom.copylinkingdocx1.incwfdefid)
                    //                 })());
                    //             }
                    //             // cup - revises - correction in 3b2
                    //             // to copy latest file for within the activity
                    //             if (ele.custom && ele.custom.copyentfile) {
                    //                 awaits.push((async () => {
                    //                     await copyEntFileForAllChapter(clientUtility, ele.custom.copyentfile.completiontriggerwfdefid)
                    //                 })());
                    //             }
                    //             // to copy page target folder for outside activity
                    //             if (ele.custom && ele.custom.copyPageTarget) {
                    //                 awaits.push((async () => {
                    //                     await copyPageTargetFolder(clientUtility, ele.custom.copyPageTarget.srcWfdefId)
                    //                 })());
                    //             }

                    //             if (ele.custom && ele.custom.copyFile) {
                    //                 awaits.push((async () => {
                    //                     await internalShippingFile(clientUtility,ele.custom.copyFile)
                    //                 })());
                    //             }

                    //         }
                    //         if (type == 'sync') {

                    //             if (ele.custom.check_error && ele.mandatoryCheck && ele.mandatoryCheck[action]) {
                    //                 awaits.push((async () => {
                    //                     let data = await readFileContent(ele.name, i, clientUtility, filesInfo);
                    //                     await checkError(data, ele.custom.check_error)
                    //                 })());
                    //             }
                    //         }

                    //     }
                    // })
                }
            });
            await Promise.all(awaits);
        }
        else{
            let pwait=[];
            console.log('new flow')
           let page_range = filesInfo.extractedFiles.filter(file => (file.custom || []).filter(x => x.toLocaleLowerCase() === "page_range").length > 0);
           console.log(page_range)
            page_range.forEach(ele => {
             pwait.push((async () => {
                    if(isPathExist(ele.name)){
                     var data=await  readSmallFile(ele.name)
                    }
                if (data && data.length > 0) {
                    let incomingFileId=clientUtility.activityDetails.fileType.fileId
                        await updateNewFileName(data, incomingFileId,clientUtility);
                        clientUtility.updateFileDetails = true;
                    }
                })());
            });
            await Promise.all(pwait);
        }
            resolve();
        } catch (error) {
            global.log("validateTextFile error", error);
            reject(error);
        }
    });
}

jobSheetFileCopy = async (clientUtility, GenerateJobSheetDetails) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(clientUtility);
            var folderStructurePayload;
            if (clientUtility.activityDetails.customer.id == '11') {
                folderStructurePayload = {
                    type: clientUtility.activityDetails.allowSubFileType ? 'wo_incoming_file_subtype' : 'wo_incoming_filetype',
                    du: clientUtility.activityDetails.du,
                    customer: clientUtility.activityDetails.customer,
                    workOrderId: clientUtility.activityDetails.workOrderId,
                    service: clientUtility.activityDetails.service,
                    fileType: {
                        name: clientUtility.activityDetails.fileType.name,
                        id: clientUtility.activityDetails.fileType.id,
                        fileId: clientUtility.activityDetails.fileType.fileId
                    }

                };
                const destPath = extendedJoin([clientUtility.pathDetails.client.path, '/']);
                var sourcePath = await getFileTypeFolderStructure(folderStructurePayload);
                let RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(sourcePath);
                for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                    const element = RetreiveBlobFilesURLs[index];
                    // let stageName =  clientUtility.activityDetails.stage.name.match(/-?\d+\.?\d*/)[0]
                    if (element && element.path && element.path.includes('.xml')) {
                        sourcePath = element.path
                        let fileName = basename(sourcePath)
                        clientUtility.filesDownload.push({ src: sourcePath, destBasePath: destPath, name: fileName, srcPath: sourcePath });
                    }
                }

            }
            else {
                folderStructurePayload = {
                    type: 'wo_stage_iteration_mail',
                    du: clientUtility.activityDetails.du,
                    customer: clientUtility.activityDetails.customer,
                    workOrderId: clientUtility.activityDetails.workOrderId,
                    service: clientUtility.activityDetails.service,
                    stage: clientUtility.activityDetails.stage
                };
                var folderName = clientUtility.activityDetails.config.GenerateJobSheetDetails ? dirname(clientUtility.activityDetails.config.GenerateJobSheetDetails) : GenerateJobSheetDetails.length > 0 ? dirname(GenerateJobSheetDetails[0].name) != '.' ? dirname(GenerateJobSheetDetails[0].name) : "" : ""
                let destPath = folderName ? extendedJoin([clientUtility.pathDetails.client.path, '/', folderName]) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                destPath = getFormattedName(destPath, clientUtility.activityDetails.placeHolders)
                var sourcePath = await getFileTypeFolderStructure(folderStructurePayload);
                let
                    RetreiveBlobFilesURLs;
                if (clientUtility.activityDetails.dmsType == 'azure') {
                    RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(sourcePath);
                } else {
                    RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(sourcePath)

                }
                if (!(RetreiveBlobFilesURLs && RetreiveBlobFilesURLs.length > 0)) {
                    // folderStructurePayload = {
                    //     type: ,
                    //     du: clientUtility.activityDetails.du,
                    //     customer: clientUtility.activityDetails.customer,
                    //     workOrderId: clientUtility.activityDetails.workOrderId,
                    //     service: clientUtility.activityDetails.service,
                    //     fileType: {
                    //         name: clientUtility.activityDetails.fileType.name,
                    //         id: clientUtility.activityDetails.fileType.id,
                    //         fileId: clientUtility.activityDetails.fileType.fileId
                    //     }

                    // };

                    folderStructurePayload = {
                        type: 'wo_stage_iteration_mail',
                        du: clientUtility.activityDetails.du,
                        customer: clientUtility.activityDetails.customer,
                        workOrderId: clientUtility.activityDetails.workOrderId,
                        service: clientUtility.activityDetails.service,
                        stage: {
                            name: clientUtility.activityDetails.stage.id == '20' ? clientUtility.activityDetails.stage.name : 'Pre Editing',
                            id: clientUtility.activityDetails.stage.id == '20' ? clientUtility.activityDetails.stage.id : '23',
                            iteration: clientUtility.activityDetails.stage.iteration,
                        }
                    };
                    var sourcePath = await getFileTypeFolderStructure(folderStructurePayload);
                    if (clientUtility.activityDetails.dmsType == 'azure') {
                        RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(sourcePath);
                    } else {
                        RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(sourcePath)

                    }
                    if (!(RetreiveBlobFilesURLs && RetreiveBlobFilesURLs.length > 0)) {
                        folderStructurePayload = {
                            type: 'wo_stage_iteration_mail',
                            du: clientUtility.activityDetails.du,
                            customer: clientUtility.activityDetails.customer,
                            workOrderId: clientUtility.activityDetails.workOrderId,
                            service: clientUtility.activityDetails.service,
                            stage: {
                                name: "Incoming",
                                id: "1",
                                iteration: clientUtility.activityDetails.stage.iteration
                            }
                        };
                        var sourcePath = await getFileTypeFolderStructure(folderStructurePayload);
                        if (clientUtility.activityDetails.dmsType == 'azure') {
                            RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(sourcePath);
                        } else {
                            RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(sourcePath)

                        }
                    }
                }
                let skipOldForWfdefids = ['738']
                 let filtered = skipOldForWfdefids.filter((list)=> list != clientUtility.activityDetails.wfDefId)
                for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                    const element = RetreiveBlobFilesURLs[index];
                    let jobsheetName = GenerateJobSheetDetails[0].name.includes('_') && GenerateJobSheetDetails[0].name.split('_') ? GenerateJobSheetDetails[0].name.split('_')[1] : 'Jobsheet'
                    let stageName = clientUtility.activityDetails.stage.name.match(/-?\d+\.?\d*/) ? clientUtility.activityDetails.stage.name.match(/-?\d+\.?\d*/)[0] : clientUtility.activityDetails.stage.name
                    let jobsheet = stageName.includes('300') || stageName.includes('200') || stageName.includes('600')

                    if (element && element.path && element.path.includes('.xml') && (element.path.includes(stageName) || (!(jobsheet) && element.path.includes(jobsheetName)))) {
                        sourcePath = element.path
                        let fileName = basename(sourcePath)
                        if(filtered.length >0 && !(sourcePath.includes('Old'))){
                            clientUtility.filesDownload.push({ src: sourcePath, destBasePath: destPath, name: fileName, srcPath: sourcePath });

                        }
                    }

                }


            }
            // sourcePath = sourcePath ? sourcePath + 'jobsheet.xml' : ''
            // let fileName = clientUtility.activityDetails.config.GenerateJobSheetDetails

            resolve()
        }
        catch (e) {
            global.log("job-sheet-file-copu", e);
            reject(e)
        }
    })
}



copyBookFilesFromStage50 = async (clientUtility, copyBookFilesFromOtherStage) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(clientUtility);
            let stage = {
                "iteration": 1,
                "name": "stage 50",
                "id": "83"
            }
            let activity = {
                "iteration": 1,
                "name": "split manuscript",
                "id": "386"
            }
            var folderStructurePayload;
            folderStructurePayload = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: clientUtility.activityDetails.du,
                customer: clientUtility.activityDetails.customer,
                workOrderId: clientUtility.activityDetails.placeHolders.bookworkOrderId,
                service: clientUtility.activityDetails.service,
                stage: stage,
                activity: activity,
                fileType: {
                    name: "book",
                    id: "1",
                    fileId: ""
                }

            };
            const destPath = extendedJoin([clientUtility.pathDetails.client.path, '/']);
            var sourcePath = await getFileTypeFolderStructure(folderStructurePayload);
            let filename = clientUtility.activityDetails.placeHolders.BookFileName + '.docx';
            // let oldFilename = clientUtility.activityDetails.placeHolders.BookFileName + '_Old.docx';
            let msFilename = clientUtility.activityDetails.placeHolders.BookFileName + '_MS.docx';
            // var result = await localHelper.localcopyFile({ srcPath: extendedJoin([sourcePath, filename]), name: filename, destBasePath: destPath })
            // await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, filename,filename,clientUtility);
            var lwfpath = clientUtility.pathDetails.client.path + '/' + clientUtility.activityDetails.placeHolders.BookFileName + '.docx'
            if(!clientUtility.activityDetails.placeHolders.indexRequired || clientUtility.activityDetails.activity.id == 382){

            if (!isPathExist(lwfpath)) {
            if (os.platform() == "win32") {
                await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, filename,'local', clientUtility);
                // await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, oldFilename,'local', clientUtility);
                await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, msFilename,'local', clientUtility);
            }
            else {
                await localHelper.downloadlocalFile(extendedJoin([sourcePath, filename]), destPath, filename, clientUtility);
            }
            // const retreivedFiles = await retreiveLocalFiles(extendedJoin([sourcePath, '**', '*']));
            // for (let index = 0; index < retreivedFiles.length; index++) {
            //     const element = retreivedFiles[index];
            //     let fileName = basename(element)
            //     var ext = extname(fileName)
            //     let fileName1 = fileName.replace(ext, "")
            //     if (fileName1 && fileName1.includes(clientUtility.activityDetails.placeHolders.BookFileName)) {
            //         sourcePath = element
            //         clientUtility.filesDownload.push({ src: sourcePath, destBasePath: destPath, name: fileName, srcPath: sourcePath });
            //     }
            // }
        }
    }
    else if(clientUtility.activityDetails.placeHolders.indexRequired && clientUtility.activityDetails.activity.id == 129) {
        if (!isPathExist(lwfpath)) {
            if (os.platform() == "win32") {
               // await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, filename,'local', clientUtility);
                // await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, oldFilename,'local', clientUtility);
                await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, msFilename,'local', clientUtility);
            }
            else {
                await localHelper.downloadlocalFile(extendedJoin([sourcePath, filename]), destPath, filename, clientUtility);
            }
        }
    }

            resolve()
        }
        catch (e) {
            global.log("copyBookFilesFromStage50", e);
            reject(e)
        }
    })
}

copyReferenceFileFromStage50 = async (clientUtility, copyBookFilesFromOtherStage) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(clientUtility);
            let stage = {
                "iteration": 1,
                "name": "stage 50",
                "id": "83"
            }
            let activity = {
                "iteration": 1,
                "name": "split manuscript",
                "id": "386"
            }
            var folderStructurePayload;
            folderStructurePayload = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: clientUtility.activityDetails.du,
                customer: clientUtility.activityDetails.customer,
                workOrderId: clientUtility.activityDetails.placeHolders.bookworkOrderId,
                service: clientUtility.activityDetails.service,
                stage: stage,
                activity: activity,
                fileType: {
                    name: "book",
                    id: "1",
                    fileId: ""
                }

            };
            const destPath = extendedJoin([clientUtility.pathDetails.client.path, '/']);
            var sourcePath = await getFileTypeFolderStructure(folderStructurePayload);
            let filename = clientUtility.activityDetails.placeHolders.ChapterId + '_ReferencePDF.pdf';

            var lwfpath = clientUtility.pathDetails.client.path + '/' + clientUtility.activityDetails.placeHolders.BookFileName + '.docx'


            if (!isPathExist(lwfpath)) {
            if (os.platform() == "win32") {
                await localHelper.downloadLocalFileWithImpersonator(extendedJoin([sourcePath, filename]), destPath, filename,'local', clientUtility);
            }
            else {
                await localHelper.downloadlocalFile(extendedJoin([sourcePath, filename]), destPath, filename, clientUtility);
            }
        }
            resolve()
        }
        catch (e) {
            global.log("copyReferenceFileFromStage50", e);
            reject(e)
        }
    })
}


fileValidation = (filesCustom, clientUtility, fileInfo) => {
    return new Promise(async (resolve, reject) => {
        try {
            const placeHolders = {
                ...clientUtility.activityDetails.placeHolders,
                ...{ PageRange: fileInfo.pageRange },
                ...{ FileTypeName: fileInfo.name },
            };
            const sourceName = filesCustom.name
                ? getFormattedName(filesCustom.name, placeHolders)
                : "";
            let validate = filesCustom.latestFileCheck;
            if (validate) {
                validate.forEach((element, i) => {
                    validate[i] = getFormattedName(element, placeHolders);
                });
                let Errors = [];
                for (let index = 0; index < validate.length; index++) {
                    const fileName = validate[index];
                    const sourcePath = extendedJoin([
                        clientUtility.pathDetails.client.path,
                        "/",
                        sourceName,
                    ]);
                    const targetPath = extendedJoin([
                        clientUtility.pathDetails.client.path,
                        "/",
                        fileName,
                    ]);
                    if (isPathExist(sourcePath) && isPathExist(targetPath)) {
                        const fstatSrc = await stat(sourcePath);
                        const fstatTarget = await stat(targetPath);
                        if (fstatTarget && fstatSrc) {
                            if (!(fstatTarget.mtime > fstatSrc.mtime)) {
                                Errors.push(fileName);
                            }
                        }
                    }
                }
                const makeString = (arr) => {
                    if (arr.length === 1) return arr[0];
                    const firsts = arr.slice(0, arr.length - 1);
                    const last = arr[arr.length - 1];
                    return firsts.join(", ") + " and " + last;
                };
                if (Errors.length > 0) {
                    throw `Latest ${makeString(
                        Errors
                    )} is not found as ${sourceName} was updated`;
                }
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
};

updateTemplateFile = (filesInfo, clientUtility, action, type) => {
    return new Promise(async (resolve, reject) => {
        try {
            for (let i = 0; i < clientUtility.fileMovementConfig.length; i++) {
                let { istemplatesrc } = clientUtility.fileMovementConfig[i];
                istemplatesrc = !!istemplatesrc;
                let templateDetails = [];
                if (istemplatesrc) {
                    templateDetails = await updateLatestTemplateFileForWoid(clientUtility.fileMovementConfig[i], clientUtility)
                }
                if (templateDetails.length > 0) {
                    templateDetails.forEach(async (ele) => {
                        if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.srcPath)).length == 0) {
                            clientUtility.filesDownload.push({ src: ele.src, destBasePath: ele.destBasePath, name: ele.name, srcPath: ele.srcPath });
                        }
                    })
                }

                // if (templateDetails && templateDetails.length > 0 && templateDetails[0].type == 'update') {
                //     await updateTemplateFileDetails(filesInfo, clientUtility, templateDetails[0], 'update')
                // } else if (templateDetails && templateDetails.length > 0) {
                //     // await delte
                //     await updateTemplateFileDetails(filesInfo, clientUtility, templateDetails[0], 'delete')
                // }
            }
            resolve()
        }

        catch (e) {
            console.log(e, "error in upload template file")
        }
    })
}

copyNewCommonFolderPath = (clientUtility, copyCommonFolderPath) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(clientUtility, 'clientUtility')
            let folderName = copyCommonFolderPath[0].name

            folderStructurePayload = {
                type: 'wo_stage_iteration_mail',
                du: clientUtility.activityDetails.du,
                customer: clientUtility.activityDetails.customer,
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: clientUtility.activityDetails.service,
                stage: clientUtility.activityDetails.stage
            };

            var src = await getFileTypeFolderStructure(folderStructurePayload);
            //    let src =`prodrepository/springer_9/springer_10/1716/typesetting_1/stage_200_18/1/Common/mail/`;
            let dest = clientUtility.pathDetails.client.path
            let RetreiveBlobFilesURLs = []

            switch (clientUtility.activityDetails.dmsType) {
                case 'azure':
                    RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(src);
                    break;
                default:
                    break;
            }
            console.log(RetreiveBlobFilesURLs, 'RetreiveBlobFilesURLs')
            RetreiveBlobFilesURLs.forEach((list) => {
                let sourcePath = list.path
                let fileName = basename(sourcePath)
                clientUtility.filesDownload.push({ srcPath: sourcePath, uuid: 'azure', destBasePath: dest, name: fileName });
            })
            resolve()
        }

        catch (e) {
            console.log(e, "error in copy page_target file")
        }
    })
}

copyRevisedFilesToServer = (clientUtility, copyRevisedFilesToServer) => {
    return new Promise(async (resolve, reject) => {
        try {
            let payload = {
                customerid: clientUtility.activityDetails.customer,
                issuemstid: clientUtility.activityDetails.issuemstid,
                isrevises: clientUtility.activityDetails.stage.name.toLocaleLowerCase() == 'Issue Revises' ? true : false,
                workorderid: clientUtility.activityDetails.workOrderId,
                destpath: clientUtility.pathDetails.client.path + '/'
            }
            await getRevisedFileInfoE2E(payload)
            resolve(true)
        } catch (error) {
            resolve(true)
            console.log(error, "Error in copying files to server");
        }
    })
}

copyPageTargetFolder = (clientUtility, copyPageTarget) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(clientUtility, 'clientUtility')
            let folderName = copyPageTarget[0].name.replace('/**/*', '')

            let src = `${clientUtility.activityDetails.stage.basePath}${folderName}`;
            let dest = `${clientUtility.pathDetails.client.path}/${folderName}/`

            let RetreiveBlobFilesURLs = []

            switch (clientUtility.activityDetails.dmsType) {
                case 'azure':
                    RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(src);
                    break;
                case 'local':
                    RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(src)
                default:
                    break;
            }

            console.log(RetreiveBlobFilesURLs, 'RetreiveBlobFilesURLs')
            RetreiveBlobFilesURLs.forEach((list) => {
                let sourcePath = list.path
                let fileName = basename(sourcePath)
                clientUtility.filesDownload.push({ srcPath: sourcePath, uuid: clientUtility.activityDetails.dmsType, destBasePath: dest, name: fileName });
            })
            resolve()
        }

        catch (e) {
            console.log(e, "error in copy page_target file")
        }
    })
}



uploadPageTargetFolder = (clientUtility, copyPageTarget) => {
    return new Promise(async (resolve, reject) => {
        try {
            let excludedFiles = []
            let folderName = copyPageTarget[0].name.replace('/**/*', '')

            let folderPath = `${clientUtility.pathDetails.client.path}/${folderName}/`
            let srcFiles = await retreiveLocalFiles(extendedJoin([folderPath, '**', '*']), excludedFiles);
            // clientUtility.outerFiles =srcFiles
            console.log(clientUtility, srcFiles, 'srcFiles')
            let uploadFile = []
            srcFiles.forEach((list) => {
                // uploadFile.push(dest : clientUtility.activityDetails.stage.basePath, )
                const fileDetails = {
                    skipTRNEntry: true,
                    path: '',
                    dest: `${clientUtility.activityDetails.stage.basePath}${folderName}/`,
                    src: list,
                    relativeSrc: extendedJoin([list], false).replace(clientUtility.pathDetails.client.path, ''),
                    srcName: basename(list)
                }
                uploadFile.push(fileDetails)
            })
            clientUtility.extraUploadfile = uploadFile
            console.log(uploadFile, 'uploadFile')
            resolve()
        }
        catch (e) {
            console.log(e, "error in upload page_target file")
        }
    })
}

checkError = (data, config) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (data.includes(config.contains_text)) {
                resolve(true)
            } else {
                reject(config.error_msg)
            }
        } catch (error) {
            global.log("updateNewFileName", error);
            reject(error.message ? error.message : error);
        }
    })
}

updateNewFileName = (data, incomingFileId,clientUtility={}) => {
    return new Promise(async (resolve, reject) => {
        try {
            // let tempData = data.split('"');
            if (data.includes('PII') && data.includes('Package Name')) {
                const regex = /Package Name='([^']+)'[\s\r\n]*PII='([^']+)'/;
               let tempData =  data.match(regex)
                var newFile,piiNumber = '',
                
                    newFile = tempData[1].replaceAll("\'", "")
                    piiNumber=tempData[2].replaceAll("\'", "")
                    newFile = basename(newFile)
                    var ext = extname(newFile)
                    newFile = newFile.replace(ext, "")
            
                const payload = {
                    incomingFileId: incomingFileId,
                    newFileName: newFile,
                    piiNumber:piiNumber
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                if (tempData[0].includes('PII') && piiNumber && newFile) {
                    try {
                        const updateNewFileName = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateNewFileName}`, payload, headers);
                        clientUtility.activityDetails.placeHolders= { ...clientUtility.activityDetails.placeHolders, ManuscriptZipName: newFile }
                        resolve(updateNewFileName)
                    } catch (error) {
                        reject("Fail to update New File Name")
                    }
                } else {
                    reject("Text file not in format")
                }
            }
           else  if (data.includes('PDF_Name') || data.includes('Package Name') ) {
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
                        const updateNewFileName = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateNewFileName}`, payload, headers);
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

updateRomanNumberFileName = (data, filesInfo, isRoman, clientUtility, type) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(clientUtility, "clientUtility")
            const placeHolders = { ...clientUtility.activityDetails.placeHolders, ... { PageRange: filesInfo.pageRange } }
            console.log(placeHolders, "placeHolders")
            var fileName1 = getFormattedName(data, placeHolders)
            var ext = extname(fileName1)
            var fileName = fileName1.replace(ext, "")
            var romanString;
            // let pattern = /\b((?:I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3}|XIV|XV|XVI{1,3}|XIX|XX|XXI{1,3}|XXIV|XXV|XXVI{1,3}|XXIX|XXX))\b/g
            let pattern = /[XMLIV]+/gm
            var isValidRoman = pattern.test(fileName)

            if (type == "number") {
                isValidRoman = !isValidRoman
            }
            if (isRoman) {
                var array1 = fileName.split('_')
                var arraylen = fileName.replace(ext, "")
                romanString = array1.length > 0 ? array1[0] + '_p' : fileName
                var array = array1.length > 0 ? array1[1].split('-') : fileName
                let awt = [];
                array.forEach(async (list, k) => {
                    awt.push(RenameAsRoman(list, k, fileName));
                })
                await Promise.all(awt);
            }
            console.log(romanString, "romanString")
            var romstrg = type == "roman" ? isRoman ? romanString : fileName : romanString

            async function RenameAsRoman(list, k, name) {
                let r = type == "roman" ? list.match(/\d+/g) : list.includes('p') ? list.replace('p', "") : list;
                if (r) {
                    console.log(parseInt(r[0]), "okkk");
                    let result = type == "roman" ? await convertNormalToRomanNumbers(parseInt(r[0])) : await convertRomanToNormalNumbers(r);
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
            console.log(romstrg, "romstrg")
            const payload = {
                incomingFileId: filesInfo.incomingFileId,
                newFileName: isValidRoman ? fileName : isRoman ? romstrg : tempData[1].split('"')[1]
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            try {
                const updateNewFileName = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateNewFileName}`, payload, headers);
                resolve(updateNewFileName)
            } catch (error) {
                reject("Fail to update New File Name")
            }
            // rename local file
            //   if(type == 'number'){
            var lwfpath = clientUtility.pathDetails.client.path
            var newFileName = isValidRoman ? fileName : isRoman ? romstrg : ""
            if (isPathExist(lwfpath)) {
                var commonFile = await GetAllFiles(lwfpath)
                for (let i = 0; i < commonFile.length; i++) {
                    var oldFileName = basename(commonFile[i]);
                    let ext = extname(commonFile[i]);
                    console.log(oldFileName)
                    if (oldFileName.includes('pre')) {
                        var oldCurrentPath = extendedJoin([lwfpath, oldFileName]);
                        var newCurrentPath = extendedJoin([lwfpath, newFileName + ext]);
                        const fileHandle = await rename(oldCurrentPath, newCurrentPath);

                    }
                }
            }
            //   }
        }
        catch (error) {
            global.log("updateNewFileName", error);
            reject(error.message ? error.message : error);
        }
    });
}

convertNormalToRomanNumbers = (name) => {
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

convertRomanToNormalNumbers = (name) => {
    var str1 = name
    if (str1 == null) return -1;
    var num = char_to_int(str1.charAt(0));
    var pre, curr;

    for (var i = 1; i < str1.length; i++) {
        curr = char_to_int(str1.charAt(i));
        pre = char_to_int(str1.charAt(i - 1));
        if (curr <= pre) {
            num += curr;
        } else {
            num = num - pre * 2 + curr;
        }
    }
    console.log(num, 'roman to number')
    return num;
}

function char_to_int(c) {
    switch (c) {
        case 'I': return 1;
        case 'V': return 5;
        case 'X': return 10;
        case 'L': return 50;
        case 'C': return 100;
        case 'D': return 500;
        case 'M': return 1000;
        default: return -1;
    }
}
getGraphicStageActivityDetailsForGraphicImage = (clientUtility, imageCopy) => {
    return new Promise(async (resolve, reject) => {
        try {
            var graphicEnabledActivities = [];
            var retrieveSourceFileList = [];
            var fileDetailsInIncoming = await getIncomingFileTypeDetails(clientUtility);
            let awt = [];
            for (let i = 0; i < imageCopy.customwfdefid.length; i++) {
                awt.push(graphicDetailsFun(imageCopy.name, imageCopy.customwfdefid[i]));
            }
            await Promise.all(awt);
            awt = [];
            for (let i = 0; i < graphicEnabledActivities.length; i++) {
                awt.push(graphicEnabledActivitiesFun(i));
            }
            await Promise.all(awt);
            resolve({ retrieveSourceFileList, fileterdDetailsName: [], fileDetailsInIncoming })
        } catch (error) {
            global.log("checkPriority", error);
            reject(error.message ? error.message : error);

        }

        async function graphicEnabledActivitiesFun(i) {
            let graphicItDetails = await getGraphicIterationDetails(graphicEnabledActivities[i], clientUtility);
            if (graphicItDetails && graphicItDetails.length > 0) {
                if (clientUtility.activityDetails.fileType.id != null) {
                    const folderStructurePaylod = {
                        type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                        du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                        customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                        workOrderId: clientUtility.activityDetails.workOrderId,
                        service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                        stage: { name: graphicEnabledActivities[i].stageName, id: graphicEnabledActivities[i].stageId, iteration: graphicItDetails[0].stageiterationcount },
                        activity: { name: graphicEnabledActivities[i].activityName, id: graphicEnabledActivities[i].activityId, iteration: graphicItDetails[0].activityiterationcount },
                        fileType: { name: clientUtility.activityDetails.fileType.name, id: clientUtility.activityDetails.fileType.id, fileId: clientUtility.activityDetails.fileType.fileId },
                    };
                    let sourcePath = await getFileTypeFolderStructure(folderStructurePaylod);
                    // let sourcePath = await getFormattedGraphicPath(clientUtility.activityDetails.du.id,clientUtility.activityDetails.customer.id);

                    let fileterdDetailsName = fileDetailsInIncoming && fileDetailsInIncoming.length > 0 && clientUtility.activityDetails.fileType && clientUtility.activityDetails.fileType.id && fileDetailsInIncoming.filter((list) => list.filetypeid == clientUtility.activityDetails.fileType.id);
                    const path = (fileterdDetailsName && fileterdDetailsName.length > 0 ? extendedJoin([sourcePath], false) : '') + fileterdDetailsName[0].filename;
                    const path1 = (fileterdDetailsName && Object.keys(fileterdDetailsName).length > 0 ? extendedJoin([sourcePath], false) : '') + fileterdDetailsName[0].filename + '_Images';
                    let awt = [];
                    let fileDetails = {};
                    let fileDetails1 = {}
                    switch (clientUtility.activityDetails.dmsType) {
                        case "azure":
                            fileDetails = { "isExist": true, "path": path }
                            fileDetails1 = { "isExist": true, "path": path1 }
                            awt.push(fileDetails)
                            awt.push(fileDetails1)
                            break;
                        case "local":
                            fileDetails = { "isExist": true, "path": path }
                            fileDetails1 = { "isExist": true, "path": path1 }
                            awt.push(fileDetails)
                            awt.push(fileDetails1)
                            break;
                        default:
                            fileDetails = await isFileExistOKM(path)
                            console.log("fileDetails", fileDetails)
                            awt.push(fileDetails)
                            fileDetails1 = await isFileExistOKM(path1)
                            console.log("fileDetails1", fileDetails1)
                            awt.push(fileDetails1)
                            break;
                    }

                    const fileExistDetails = await Promise.all(awt);
                    awt = [];
                    fileExistDetails.forEach(ele => {
                        if (ele.isExist)
                            awt.push(limit(() => retreiveOKMFiles(ele.path, clientUtility.activityDetails.dmsType).then(retrieveSourceFile => {
                                // retrieveSourceFile["folderName"] = graphicEnabledActivities[i].folderName;
                                // retrieveSourceFileList.push(retrieveSourceFile);
                                if (retrieveSourceFile && retrieveSourceFile.length > 0) {
                                    for (var m = 0; m < retrieveSourceFile.length; m++) {
                                        retrieveSourceFile[m]["folderName"] = graphicEnabledActivities[i].folderName
                                        retrieveSourceFileList.push(retrieveSourceFile[m])
                                    }
                                }
                            })));
                    });
                    await Promise.all(awt);
                } else {
                    let awt = [];
                    for (let k = 0; k < fileDetailsInIncoming.length; k++) {
                        awt.push(limit(() => fileDetailsInComingFun2(graphicItDetails, k, i)));
                    }
                    await Promise.all(awt);
                }
            }
            return { fileDetailsInIncoming, graphicItDetails };
        }

        async function graphicDetailsFun(folderName, wfdefid) {
            const payload = {
                wfdefid: wfdefid
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getGraphicStageActivityDetails}`, payload, headers);
            if (Array.isArray(details)) {
                details.forEach((list) => {
                    list.folderName = folderName
                    graphicEnabledActivities.push(list)
                })
            }
            else if (Object.keys(details).length > 0) {
                details.folderName = folderName
                graphicEnabledActivities.push(details);
            }
        }

        async function fileDetailsInComingFun2(graphicItDetails, k, i) {
            const folderStructurePaylod = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                stage: { name: graphicEnabledActivities[i].stageName, id: graphicEnabledActivities[i].stageId, iteration: graphicItDetails[0].stageiterationcount },
                activity: { name: graphicEnabledActivities[i].activityName, id: graphicEnabledActivities[i].activityId, iteration: graphicItDetails[0].activityiterationcount },
                fileType: { name: fileDetailsInIncoming[k].filetype, id: fileDetailsInIncoming[k].filetypeid, fileId: fileDetailsInIncoming[k].woincomingfileid },
            };
            let sourcePath = await getFileTypeFolderStructure(folderStructurePaylod);

            // let sourcePath = await getFormattedGraphicPath(clientUtility.activityDetails.du.id,clientUtility.activityDetails.customer.id);

            let fileterdDetailsName = fileDetailsInIncoming[k];
            const path = (fileterdDetailsName && Object.keys(fileterdDetailsName).length > 0 ? extendedJoin([sourcePath], false) : '') + fileDetailsInIncoming[k].woincomingfileid + '/' + fileterdDetailsName.filename;
            const path1 = (fileterdDetailsName && Object.keys(fileterdDetailsName).length > 0 ? extendedJoin([sourcePath], false) : '') + fileDetailsInIncoming[k].woincomingfileid + '/' + fileterdDetailsName.filename + '_Images';
            let awt = [];
            let fileDetails = {};
            let fileDetails1 = {}
            switch (clientUtility.activityDetails.dmsType) {
                case "azure":
                    fileDetails = { "isExist": true, path: path }
                    fileDetails1 = { "isExist": true, path: path1 }
                    awt.push(fileDetails)
                    awt.push(fileDetails1)
                    break;
                case "local":
                    fileDetails = { "isExist": true, path: path }
                    fileDetails1 = { "isExist": true, path: path1 }
                    awt.push(fileDetails)
                    awt.push(fileDetails1)
                    break;
                default:
                    fileDetails = await isFileExistOKM(path)
                    console.log("fileDetails", fileDetails)
                    awt.push(fileDetails)
                    fileDetails1 = await isFileExistOKM(path1)
                    console.log("fileDetails1", fileDetails1)
                    awt.push(fileDetails1)
                    break;
            }

            // awt.push(isFileExistOKM(path))
            // awt.push(isFileExistOKM(path1))
            const fileExistDetails = await Promise.all(awt);
            awt = [];
            fileExistDetails.forEach(ele => {
                if (ele.isExist) {
                    awt.push(limit(() => retreiveOKMFiles(ele.path, clientUtility.activityDetails.dmsType).then(retrieveSourceFile => {
                        if (retrieveSourceFile && retrieveSourceFile.length > 0) {
                            for (var h = 0; h < retrieveSourceFile.length; h++) {
                                retrieveSourceFile[h]["folderName"] = graphicEnabledActivities[i].folderName;
                                retrieveSourceFileList.push(retrieveSourceFile[h]);
                            }
                        }
                    })));
                }
            });
            await Promise.all(awt);
        }
    })
}

getGraphicStageActivityDetailsForGraphicText = (clientUtility, customwfdefid = []) => {
    return new Promise(async (resolve, reject) => {
        try {
            var graphicEnabledActivities = []
            var retrieveSourceFileList = []
            for (var i = 0; i < customwfdefid.length; i++) {
                const payload = {
                    wfdefid: customwfdefid[i]
                }
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getGraphicStageActivityDetails}`, payload, headers);
                if (Array.isArray(details)) {
                    details.forEach((list) => {
                        // list.folderName = graphicKeys && graphicKeys.length > 0 && graphicDetails && Object.keys(graphicDetails).length > 0 && graphicKeys.includes('folderName') ? graphicDetails['folderName'] : ""
                        graphicEnabledActivities.push(list)
                    })
                } else {
                    if (Object.keys(details).length > 0) {
                        // details.folderName = graphicKeys && graphicKeys.length > 0 && graphicDetails && Object.keys(graphicDetails).length > 0 && graphicKeys.includes('folderName') ? graphicDetails['folderName'] : ""
                        graphicEnabledActivities.push(details)
                    }
                }
            }
            var fileDetailsInIncoming = await getIncomingFileTypeDetails(clientUtility);
            for (var i = 0; i < graphicEnabledActivities.length; i++) {
                var graphicItDetails = await getGraphicIterationDetails(graphicEnabledActivities[i], clientUtility)
                if (graphicItDetails && graphicItDetails.length > 0) {
                    if (clientUtility.activityDetails.fileType.id != null) {
                        const folderStructurePaylod = {
                            type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                            du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                            customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                            workOrderId: clientUtility.activityDetails.workOrderId,
                            service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                            stage: { name: graphicEnabledActivities[i].stageName, id: graphicEnabledActivities[i].stageId, iteration: graphicItDetails[0].stageiterationcount },
                            activity: { name: graphicEnabledActivities[i].activityName, id: graphicEnabledActivities[i].activityId, iteration: graphicItDetails[0].activityiterationcount },
                            fileType: { name: clientUtility.activityDetails.fileType.name, id: clientUtility.activityDetails.fileType.id, fileId: clientUtility.activityDetails.fileType.fileId },
                        }

                        var sourcePath = await getFileTypeFolderStructure(folderStructurePaylod)

                        let fileExistDetails = {};
                        switch (clientUtility.activityDetails.dmsType) {
                            case "azure":
                                fileExistDetails = { "isExist": true, path: sourcePath }
                                break;
                            case "local":
                                fileExistDetails = { "isExist": true, path: sourcePath }
                                break;
                            default:
                                fileExistDetails = await isFileExistOKM(sourcePath)
                                console.log("fileExistDetails", fileExistDetails)

                                break;
                        }
                        if (fileExistDetails.isExist) {
                            var retrieveSourceFile = await retreiveOKMFiles(sourcePath, clientUtility.activityDetails.dmsType);
                            console.log(retrieveSourceFile, "retrieveSourceFile")
                            retrieveSourceFile["folderName"] = graphicEnabledActivities[i].folderName
                            retrieveSourceFileList.push(retrieveSourceFile)
                        }
                    }
                    else {
                        for (var k = 0; k < fileDetailsInIncoming.length; k++) {
                            const folderStructurePaylod = {
                                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                                du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                                customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                                workOrderId: clientUtility.activityDetails.workOrderId,
                                service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                                // stage: { name: graphicEnabledActivities[i].stageName, id: graphicEnabledActivities[i].stageId, iteration: clientUtility.activityDetails.stage.iteration },
                                // activity: { name: graphicEnabledActivities[i].activityName, id: graphicEnabledActivities[i].activityId, iteration: clientUtility.activityDetails.activity.iteration },
                                stage: { name: graphicEnabledActivities[i].stageName, id: graphicEnabledActivities[i].stageId, iteration: graphicItDetails[0].stageiterationcount },
                                activity: { name: graphicEnabledActivities[i].activityName, id: graphicEnabledActivities[i].activityId, iteration: graphicItDetails[0].activityiterationcount },
                                fileType: { name: fileDetailsInIncoming[k].filetype, id: fileDetailsInIncoming[k].filetypeid, fileId: fileDetailsInIncoming[k].woincomingfileid },
                            }
                            // let sourcePath = await getFormattedGraphicPath(clientUtility.activityDetails.du.id,clientUtility.activityDetails.customer.id);                     
                            //    var fileterdDetailsName = fileDetailsInIncoming[k]

                            var sourcePath = await getFileTypeFolderStructure(folderStructurePaylod)
                            var fileterdDetailsName = fileDetailsInIncoming[k]

                            // const path = (fileterdDetailsName && Object.keys(fileterdDetailsName).length > 0 ? extendedJoin([sourcePath], false) : '') +  fileDetailsInIncoming[k].woincomingfileid  +'/'+ fileterdDetailsName.filename;
                            let fileExistDetails = {};
                            switch (clientUtility.activityDetails.dmsType) {
                                case "azure":
                                    fileExistDetails = { "isExist": true, path: sourcePath }
                                    break;
                                case "local":
                                    fileExistDetails = { "isExist": true, path: sourcePath }
                                    break;
                                default:
                                    fileExistDetails = await isFileExistOKM(sourcePath)
                                    console.log("fileExistDetails", fileExistDetails)

                                    break;
                            }
                            if (fileExistDetails.isExist) {
                                var retrieveSourceFile = await retreiveOKMFiles(sourcePath, clientUtility.activityDetails.dmsType);
                                if (retrieveSourceFile && retrieveSourceFile.length > 0) {
                                    for (var h = 0; h < retrieveSourceFile.length; h++) {
                                        retrieveSourceFile[h]["folderName"] = graphicEnabledActivities[i].folderName
                                        retrieveSourceFileList.push(retrieveSourceFile[h])
                                    }
                                }
                            }
                        }
                    }
                }
            }
            var graphicTextFile = []
            if (retrieveSourceFileList && retrieveSourceFileList.length > 0) {
                var retreivedFiles = clientUtility.activityDetails.fileType.id != null ? retrieveSourceFileList[0] : retrieveSourceFileList
                for (var i = 0; i < retreivedFiles.length; i++) {
                    let name = basename(retreivedFiles[i].path);
                    let ext = extname(name);
                    if (ext === '.txt' && (name.includes('graphicText') || name.includes('Figure') || name.includes('Imagepath') || name.includes('ImagePath'))) {
                        console.log(retreivedFiles[i])
                        graphicTextFile.push(retreivedFiles[i])
                    }
                }
            }
            var fileterdDetailsName = []
            retrieveSourceFileList = graphicTextFile
            resolve({ retreievesourceFileListImg: retrieveSourceFileList, fileterdDetailsName, fileDetailsInIncoming })
        } catch (error) {
            global.log("checkPriority", error);
            reject(error.message ? error.message : error);

        }
    })
}

const retreiveOKMFiles = (sourcePath, dmsType) => {
    return new Promise(async (resolve, reject) => {
        try {
            const filePayload = {
                path: sourcePath,
                dmsType: dmsType
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const FileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.retreiveFiles}`, filePayload, headers);
            resolve(FileDetails)
        } catch (e) {
            global.log('error in fetching incoming file details')
            reject(e)
        }
    })
}



const getGraphicIterationDetails = (graphicEnabledActivities, clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            const filePayload = {
                stageId: graphicEnabledActivities.stageId,
                activityId: graphicEnabledActivities.activityId,
                woId: clientUtility.activityDetails.workOrderId
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const graphicItDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getGraphicIterationDetail}`, filePayload, headers);
            resolve(graphicItDetails)
        } catch (e) {
            global.log('error in fetching incoming file details', e)
            reject(e)
        }
    })
}


graphicsFilesDownloadLocal = async (clientUtility,imageCopyInfo,isOverWritePrint=false) =>{
    return new Promise(async (resolvce,reject) =>{
        try{
            let graphicspath = Object.keys( clientUtility.activityDetails.placeHolders).includes('filename') && clientUtility.activityDetails.placeHolders.filename != null ? imageCopyInfo.isgraphicpath
            .replace(';;FileTypeName;;',clientUtility.activityDetails.placeHolders.filename)
                    .replace(';;JournalAcronym;;',clientUtility.activityDetails.placeHolders.JournalAcronym) : imageCopyInfo.isgraphicpath
                    .replace(';;FileTypeName;;',clientUtility.activityDetails.placeHolders.BookCode)
                            .replace(';;JournalAcronym;;',clientUtility.activityDetails.placeHolders.JournalAcronym)
             let RetreiveBlobFilesURLs ='' 
            if (clientUtility.activityDetails.dmsType == 'azure') {
                RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(graphicspath); 
            } else {
                RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(graphicspath)

            };
            if(isOverWritePrint && RetreiveBlobFilesURLs && RetreiveBlobFilesURLs.length > 0)
            {
                RetreiveBlobFilesURLs.forEach(async (ele) => {
                    let localFolderName = imageCopyInfo.name && imageCopyInfo.name.length > 0 ? imageCopyInfo.name.replace(';;FileTypeName;;',clientUtility.activityDetails.placeHolders.BookCode) : '/'
                    let destBasePath = extendedJoin([clientUtility.pathDetails.client.path , localFolderName]);
                    let name = basename(ele.path)
                    if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.path)).length == 0||ele.path.toLocaleLowerCase().includes('/print/')||ele.path.toLocaleLowerCase().includes('\\print\\')) {
                            if (extname(ele.path) != '.zip' && extname(ele.path) != '.xml') {
                                clientUtility.filesDownload.push({ src: ele.uuid, destBasePath, name, srcPath: ele.path });
                            }
                        else {
                            clientUtility.filesDownload.push({ src: ele.uuid, destBasePath, name, srcPath: ele.path });
                        }
                    }
                })
            }
         else if(RetreiveBlobFilesURLs && RetreiveBlobFilesURLs.length > 0){
         
            RetreiveBlobFilesURLs.forEach(async (ele) => {
                // if (extname(ele.path).toLocaleLowerCase() !== ".eps") {
                // let destBasePath = isFolder && (basename(ele.path) != 'book_1') ? extendedJoin([clientUtility.pathDetails.client.path, element.relativePath, '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                let localFolderName = imageCopyInfo.name && imageCopyInfo.name.length > 0 ? imageCopyInfo.name : '/'
                let destBasePath = extendedJoin([clientUtility.pathDetails.client.path , localFolderName]);
                let name = basename(ele.path)
                if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.path)).length == 0) {
                        if (extname(ele.path) != '.zip' && extname(ele.path) != '.xml') {
                            clientUtility.filesDownload.push({ src: ele.uuid, destBasePath, name, srcPath: ele.path });
                        }
                    else {
                        clientUtility.filesDownload.push({ src: ele.uuid, destBasePath, name, srcPath: ele.path });
                    }
                }
            })
        };
            resolvce(true)
        }catch(error){
            reject(error)
        }

    })

}

blobFilestoZipDownloadLocal = async (clientUtility,imageCopyInfo,isOverWritePrint=false) =>{
    return new Promise(async (resolvce,reject) =>{
        try{
            let blobFilePath = Object.keys( clientUtility.activityDetails.placeHolders).includes('filename') && clientUtility.activityDetails.placeHolders.filename != null ? imageCopyInfo.name
            .replace(';FileTypeName;',clientUtility.activityDetails.placeHolders.filename)
                    .replace(';JournalAcronym;',clientUtility.activityDetails.placeHolders.JournalAcronym).replace('/**/*','') : imageCopyInfo.name.replace('/**/*','')
                    .replace(';FileTypeName;',clientUtility.activityDetails.placeHolders.BookCode)
                            .replace(';JournalAcronym;',clientUtility.activityDetails.placeHolders.JournalAcronym).replace('/**/*','')
             let RetreiveBlobFilesURLs ='' 
             let localFolderName = imageCopyInfo.name && imageCopyInfo.name.length > 0 ? imageCopyInfo.name.replace(';FileTypeName;',clientUtility.activityDetails.placeHolders.BookCode).replace('/**/*','') : '/'
             let sourcePath =extendedJoin([clientUtility.pathDetails.okm.path,`${clientUtility.activityDetails.fileType.name.toLocaleLowerCase()}_${clientUtility.activityDetails.fileType.id}`,clientUtility.activityDetails.fileType.fileId,blobFilePath]);
                let destBasePath = extendedJoin([clientUtility.pathDetails.client.path, localFolderName]);
                let name = `${basename(destBasePath)}.zip`

            if (clientUtility.activityDetails.dmsType == 'azure') {
                RetreiveBlobFilesURLs = await localHelper.downloadBlobFilestoZip(sourcePath,destBasePath,name); 
            } else {
                RetreiveBlobFilesURLs = ''
            };
            resolvce(RetreiveBlobFilesURLs)
        }
        catch(error)
        {
            reject({isSuccess:false,message:error.message?error.message:error});
        }

    })

}


graphicSaveForActivities = async (clientUtility, srcPathDetails, fileterdDetailsName, type, fileDetailsInIncoming, graphicFieldType) => {
    return new Promise(async (resolve, reject) => {
        try {
            var folderStructurePayload = {
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
            let foldername = "", folderuuid = "";
            switch (clientUtility.activityDetails.dmsType) {
                case "azure":
                    foldername = await getFileTypeFolderStructure(folderStructurePayload);
                    folderuuid = "azure";
                    break;
                case "local":
                    foldername = await getFileTypeFolderStructure(folderStructurePayload);
                    folderuuid = "local";
                    break;
                default:
                    let out1 = await createFileTypeFolderStructure(folderStructurePayload)
                    foldername = out1.name;
                    folderuuid = out1.uuid;
                    break;
            }
            const targetFilePayload = {
                woId: clientUtility.activityDetails.workOrderId,
                wfDefId: clientUtility.activityDetails.wfDefId,
                // srcPathDetails: type == 'text' ? srcPathDetails : srcPathDetails && srcPathDetails.length > 0 ? srcPathDetails[0] : srcPathDetails,
                srcPathDetails: type == 'text' ? srcPathDetails : srcPathDetails && srcPathDetails.length > 0 ? srcPathDetails.flat(1) : srcPathDetails,
                fileterdDetailsName: fileterdDetailsName,
                stageIterationCount: clientUtility.activityDetails.stage.iteration,
                activityIterationCount: clientUtility.activityDetails.activity.iteration,
                wfEventId: clientUtility.activityDetails.wfEventId,
                duname: clientUtility.activityDetails.du.name,
                duid: clientUtility.activityDetails.du.id,
                customername: clientUtility.activityDetails.customer.name,
                customerid: clientUtility.activityDetails.customer.id,
                servicename: clientUtility.activityDetails.service.name,
                serviceid: clientUtility.activityDetails.service.id,
                stagename: clientUtility.activityDetails.stage.name,
                stageid: clientUtility.activityDetails.stage.id,
                stageiterationcount: clientUtility.activityDetails.stage.iteration,
                activityname: clientUtility.activityDetails.activity.name,
                activityid: clientUtility.activityDetails.activity.id,
                activityiterationcount: clientUtility.activityDetails.activity.iteration,
                fileTypeName: clientUtility.activityDetails.fileType.name,
                fileTypeId: clientUtility.activityDetails.fileType.id,
                fileIncomingId: clientUtility.activityDetails.fileType.fileId,
                allowSubFileType: clientUtility.activityDetails.allowSubFileType,
                incomingFileDetails: fileDetailsInIncoming,
                instanceType: clientUtility.activityDetails.instanceType,
                graphicFieldType: graphicFieldType,
                basePathComman: clientUtility.activityDetails.woType == "Journal" && foldername ? foldername : clientUtility.activityDetails.woType == "Book" ? clientUtility.activityDetails.basePath : clientUtility.activityDetails.basePath,
                wfId: clientUtility.activityDetails.wfId,
                woType: clientUtility.activityDetails.woType

            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.graphicsTrnUpdate}`, targetFilePayload, headers);
            global.log("File copied successfully", details);
            //let updateData = [];
            for (let index = 0; index < details.length; index++) {
                const element = details[index];
                let isFolder = element.destBasePath.replace(clientUtility.activityDetails.basePath, "") ? element.destBasePath.replace(foldername, "") : element.destBasePath.replace(clientUtility.activityDetails.basePath, "");
                isFolder = isFolder && isFolder.length > 0 ? true : false
                let awts = [];
                element.copyData.forEach(async (ele) => {
                    // if (extname(ele.path).toLocaleLowerCase() !== ".eps") {
                    let destBasePath = isFolder && (basename(ele.path) != 'book_1') ? extendedJoin([clientUtility.pathDetails.client.path, element.relativePath, '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                    let name = basename(ele.path)
                    let name1 = name.toLocaleLowerCase()
                    if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.path)).length == 0) {
                      //  if (clientUtility.activityDetails.customer.id == '15') {
                        if (extname(ele.path) != '.zip' && (name1.includes('image') || extname(ele.path) != '.xml')) {
                            clientUtility.filesDownload.push({ src: ele.uuid, destBasePath, name, srcPath: ele.path });
                        }
                      //  }
                        // else {
                        //     clientUtility.filesDownload.push({ src: ele.uuid, destBasePath, name, srcPath: ele.path });
                        // }
                    }
                    // }
                })
            }
            resolve()
            //     let awts = [];
            //     let destUuid = await folderCreate(element.destBasePath)
            //     element.copyData.forEach(el=>{
            //         awts.push(_copyFile({ src: el.uuid, dest: destUuid, destBasePath: element.destBasePath, name:basename(el.path) }));
            //     })
            //     let out = await Promise.all(awts);
            //     out.forEach(el=>{
            //         updateData.push({
            //             wfEventId:element.wfEventId,
            //             uuid:el.uuid,
            //             path:el.path,
            //             incomingfileid:element.incomingfileid
            //         })
            //     })
            // }
            // let result = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.trnactivtyEntry}`, updateData, headers);
            // resolve(result);
        } catch (error) {
            global.log("copy file for graphic", error);
            reject(error.message ? error.message : error);
        }
    });
}

checkPriority = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            const payload = {
                woId: clientUtility.activityDetails.workOrderId,
                wfDefId: clientUtility.activityDetails.wfDefId,
                stageIterationCount: clientUtility.activityDetails.stage.iteration,
                activityIterationCount: clientUtility.activityDetails.activity.iteration,
                wfEventId: clientUtility.activityDetails.wfEventId
            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getFileSeqByPriority}`, payload, headers);
            if (details.data) {
                resolve();
            } else {
                reject(`Please complete the before file (${details.fileName})`);
            }
        } catch (error) {
            global.log("checkPriority", error);
            reject(error.message ? error.message : error);
        }
    })
}

copyFile = async (clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            const folderStructurePaylod = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                stage: { name: clientUtility.activityDetails.stage.name, id: clientUtility.activityDetails.stage.id, iteration: clientUtility.activityDetails.stage.iteration },
                activity: { name: clientUtility.activityDetails.activity.name, id: clientUtility.activityDetails.activity.id, iteration: clientUtility.activityDetails.activity.iteration },
                fileType: { name: clientUtility.activityDetails.fileType.name, id: clientUtility.activityDetails.fileType.id, fileId: clientUtility.activityDetails.fileType.fileId }
            }
            var sourcePath = await getFileTypeFolderStructure(folderStructurePaylod)
            const filePayload = {
                woId: clientUtility.activityDetails.workOrderId,
                wfDefId: clientUtility.activityDetails.wfDefId,
                stageIterationCount: clientUtility.activityDetails.stage.iteration,
                activityIterationCount: clientUtility.activityDetails.activity.iteration,
                wfEventId: clientUtility.activityDetails.wfEventId,
                basepath: clientUtility.activityDetails.basePath
            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getEventDetails}`, filePayload, headers);
            global.log("File copied successfully", details);
            details.forEach(async (ele) => {
                let isFolder = ele.destBasePath.replace(clientUtility.activityDetails.basePath, "") ? ele.destBasePath.replace(sourcePath, "") : ele.destBasePath.replace(clientUtility.activityDetails.basePath, "");
                isFolder = isFolder && isFolder.length > 0 ? true : false
                let destBasePath = isFolder ? extendedJoin([clientUtility.pathDetails.client.path, basename(ele.destBasePath), '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/'])
                let name = basename(ele.srcPath)
                if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.srcPath)).length == 0) {
                    clientUtility.filesDownload.push({ src: ele.src, destBasePath, name, srcPath: ele.srcPath });

                }
            })
            resolve();
        } catch (error) {
            global.log("copyFile", error);
            reject(error.message ? error.message : error);
        }
    });
}

copyLinkingDocxFileToPreEditingActivity = async (clientUtility, srcWfDefid, wordidwfdefid, incWfDefid) => {
    return new Promise(async (resolve, reject) => {
        try {
            const folderStructurePaylod = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                stage: { name: clientUtility.activityDetails.stage.name, id: clientUtility.activityDetails.stage.id, iteration: clientUtility.activityDetails.stage.iteration },
                activity: { name: clientUtility.activityDetails.activity.name, id: clientUtility.activityDetails.activity.id, iteration: clientUtility.activityDetails.activity.iteration },
                fileType: { name: clientUtility.activityDetails.fileType.name, id: clientUtility.activityDetails.fileType.id, fileId: clientUtility.activityDetails.fileType.fileId }
            }
            var sourcePath = await getFileTypeFolderStructure(folderStructurePaylod)
            const filePayload = {
                woId: clientUtility.activityDetails.workOrderId,
                wfDefId: clientUtility.activityDetails.wfDefId,
                srcWfDefId: srcWfDefid,
                incWfDefid: incWfDefid,
                wordIdInsertionWfDefid: wordidwfdefid,
                stageIterationCount: clientUtility.activityDetails.stage.iteration,
                activityIterationCount: clientUtility.activityDetails.activity.iteration,
                wfEventId: clientUtility.activityDetails.wfEventId,
                duname: clientUtility.activityDetails.du.name,
                duid: clientUtility.activityDetails.du.id,
                customername: clientUtility.activityDetails.customer.name,
                customerid: clientUtility.activityDetails.customer.id,
                servicename: clientUtility.activityDetails.service.name,
                serviceid: clientUtility.activityDetails.service.id,
                stagename: clientUtility.activityDetails.stage.name,
                stageid: clientUtility.activityDetails.stage.id,
                stageiterationcount: clientUtility.activityDetails.stage.iteration,
                activityname: clientUtility.activityDetails.activity.name,
                activityid: clientUtility.activityDetails.activity.id,
                activityiterationcount: clientUtility.activityDetails.activity.iteration,
                fileTypeName: clientUtility.activityDetails.fileType.name,
                fileTypeId: clientUtility.activityDetails.fileType.id,
                fileIncomingId: clientUtility.activityDetails.fileType.fileId,
                allowSubFileType: clientUtility.activityDetails.allowSubFileType

            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.copyLinkingDocxFilesForAllChapters}`, filePayload, headers);
            if (details.length > 0) {
                details.forEach(async (ele) => {
                    let isFolder = ele.destBasePath.replace(clientUtility.activityDetails.basePath, "") ? ele.destBasePath.replace(sourcePath, "") : ele.destBasePath.replace(clientUtility.activityDetails.basePath, "");
                    isFolder = isFolder && isFolder.length > 0 ? true : false
                    let destBasePath = isFolder && basename(targetTemplateDetails.foldername) != 'book_1' ? extendedJoin([clientUtility.pathDetails.client.path, basename(ele.destBasePath), '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                    if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.srcPath)).length == 0) {
                        clientUtility.filesDownload.push({ src: ele.src, destBasePath: destBasePath, name: ele.name, srcPath: ele.srcPath });
                    }
                })
            }
            global.log("File copied successfully", details);
            resolve();
        } catch (error) {
            global.log("copy LinkingDocx file from LinkingPreEditing to PreEditing - typescript File", error);
            reject(error.message ? error.message : error);
        }
    });
}

copyEntFileForAllChapter = async (clientUtility, completiontriggerWfDefid) => {
    return new Promise(async (resolve, reject) => {
        try {
            const folderStructurePaylod = {
                type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                stage: { name: clientUtility.activityDetails.stage.name, id: clientUtility.activityDetails.stage.id, iteration: clientUtility.activityDetails.stage.iteration },
                activity: { name: clientUtility.activityDetails.activity.name, id: clientUtility.activityDetails.activity.id, iteration: clientUtility.activityDetails.activity.iteration },
                fileType: { name: clientUtility.activityDetails.fileType.name, id: clientUtility.activityDetails.fileType.id, fileId: clientUtility.activityDetails.fileType.fileId }
            }
            var sourcePath = await getFileTypeFolderStructure(folderStructurePaylod)

            var incomingDetails = await getIncomingFileTypeDetails(clientUtility);

            const filePayload = {
                woId: clientUtility.activityDetails.workOrderId,
                wfDefId: clientUtility.activityDetails.wfDefId,
                completionTriggerWfDefId: completiontriggerWfDefid,
                wfEventId: clientUtility.activityDetails.wfEventId,
                incomingDetails: incomingDetails,
                basePath: clientUtility.activityDetails.basePath,
                stageIterationCount: clientUtility.activityDetails.stage.iteration,
                activityIterationCount: clientUtility.activityDetails.activity.iteration,
            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            // service
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.copyEntFileForAllChapter}`, filePayload, headers);
            if (details.length > 0) {
                details.forEach(async (ele) => {
                    let isFolder = ele.destBasePath.replace(clientUtility.activityDetails.basePath, "") ? ele.destBasePath.replace(sourcePath, "") : ele.destBasePath.replace(clientUtility.activityDetails.basePath, "");
                    isFolder = isFolder && isFolder.length > 0 ? true : false
                    let destBasePath = isFolder && basename(ele.destBasePath) != 'book_1' ? extendedJoin([clientUtility.pathDetails.client.path, basename(ele.destBasePath), '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                    if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.srcPath)).length == 0) {
                        clientUtility.filesDownload.push({ src: ele.src, destBasePath: destBasePath, name: ele.name, srcPath: ele.srcPath });
                    }
                })
            }
            global.log("File copied successfully", details);
            resolve();
        } catch (error) {
            global.log("copy LinkingDocx file from LinkingPreEditing to PreEditing - typescript File", error);
            reject(error.message ? error.message : error);
        }
    });
}


// copyPageTargetFolder = async (clientUtility, srcWfDefId) => {
//     return new Promise(async (resolve, reject) => {
//         try {
//             let foldername = clientUtility.activityDetails.stage.basePath;
//             folderuuid = "";
//             switch (clientUtility.activityDetails.dmsType) {
//                 case "azure":
//                     folderuuid = "azure";
//                     break;            
//                 default:
//                     folderuuid = await createFolder(foldername);//out1.uuid;
//                     break;
//             }
//             var incomingDetails = await getIncomingFileTypeDetails(clientUtility);            
//             const filePayload = {
//                 woId: clientUtility.activityDetails.workOrderId,
//                 wfDefId: clientUtility.activityDetails.wfDefId,
//                 srcWfDefId: srcWfDefId,
//                 wfEventId: clientUtility.activityDetails.wfEventId,
//                 basePath: clientUtility.activityDetails.basePath,
//                 duname: clientUtility.activityDetails.du.name,
//                 duid: clientUtility.activityDetails.du.id,
//                 customername: clientUtility.activityDetails.customer.name,
//                 customerid: clientUtility.activityDetails.customer.id,
//                 servicename: clientUtility.activityDetails.service.name,
//                 serviceid: clientUtility.activityDetails.service.id,
//                 incomingDetails: incomingDetails,
//                 instanceType: clientUtility.activityDetails.instanceType
//             }
//             const headers = {
//                 'Authorization': `Bearer ${config.server.getToken()}`
//             };
//             let CheckPaths = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.copyPageTarget}`, filePayload, headers);
//             let fileToCopy = [];
//             let documentDetailsNew =[]
//             if(CheckPaths.length > 0){
//                 for (const sourcePath of CheckPaths) {
//                     let fldIdCheck = {};
//                     switch (clientUtility.activityDetails.dmsType) {
//                         case "azure":
//                             fldIdCheck = {"isExist" : true,path : sourcePath}
//                             break;    
//                         default:
//                             fldIdCheck = await isFileExistOKM(sourcePath);                           
//                             break;
//                     }
//                     if (sourcePath && fldIdCheck && fldIdCheck.isExist) {
//                         let documentDetails = await retreiveOKMFiles(sourcePath, clientUtility.activityDetails.dmsType);
//                         documentDetails = Array.isArray(documentDetails) ? documentDetails : [documentDetails];
//                         documentDetailsNew =[...documentDetailsNew,...documentDetails]
//                     }
//                 }
//                 const sortedArrayDesc = documentDetailsNew.sort((a, b) => {
//                     const timeA = new Date(a.lastModified).getTime();
//                     const timeB = new Date(b.lastModified).getTime();
//                     return timeB - timeA;
//                   });
//                   console.log(sortedArrayDesc,"sortedArrayDesc")
//                   sortedArrayDesc.forEach(y => {
//                     if (fileToCopy.filter(x => basename(x.path) == basename(y.path)).length == 0) {
//                         fileToCopy.push(y);
//                     }
//                 });
//             } 

//             if (fileToCopy.length > 0) {
//                 for (let index = 0; index < fileToCopy.length; index++) {
//                     const ele = fileToCopy[index];
//                     let destPath = clientUtility.activityDetails.basePath + `book_${1}/page_target/`;
//                     let fldIdCheck = {}
//                     let dstId;
//                     switch (clientUtility.activityDetails.dmsType) {
//                         case "azure":
//                             fldIdCheck = {"isExist" : true, path :destPath}
//                             dstId = "azure";
//                             break;    
//                         default:
//                             fldIdCheck = await isFileExistOKM(destPath)
//                             console.log("fileExistDetails", fldIdCheck)
//                             if (fldIdCheck && fldIdCheck.isExist == false) {
//                                 dstId = await createFolder(clientUtility.activityDetails.basePath + `book_${1}/page_target/`)
//                             } else {
//                                 dstId = await okmHelper.getUuid(destPath)
//                             }
//                             break;
//                     }
//                     destPath = clientUtility.pathDetails.client.path + `/page_target/`; 
//                     if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(ele.srcPath||ele.path)).length == 0) {
//                         clientUtility.filesDownload.push({ src: ele.uuid, destBasePath: destPath, name: basename(ele.path), srcPath: ele.srcPath||ele.path, dest: dstId });
//                     }
//                     let srcBlobPath = foldername+`book_1/page_target/`;
//                     await azureHelper.copyFile({ srcPath: (ele.srcPath||ele.path), src: ele.uuid, dest: dstId, destBasePath: srcBlobPath, name: basename(ele.path) })
//                 }
//             }
//             // for (let index = 0; index < fileToCopy.length; index++) {
//             //     const element = fileToCopy[index];
//             //     const destPath = basePath + `book_${1}/page_target/`;
//             //     const fldIdCheck = await isFileExistOKM(destPath)
//             //     let dstId;
//             //     if (fldIdCheck && fldIdCheck.isExist == false) {
//             //         dstId = await _createFolder(basePath + `book_${1}/page_target/`)
//             //     } else {
//             //         dstId = await _getUuid(destPath)
//             //     }

//             //     const copyData = await _copyFile({ src: element.uuid, dest: dstId, destBasePath: destPath, name: basename(element.path) })
//             //     await fileTxnUpdate(wfEventId, copyData.uuid, copyData.path, filteredBookTypeDetails[0].woincomingfileid)
//             // }
//             resolve();

//         } catch (error) {
//             global.log("copy pagetarget folder", error);
//             reject(error.message ? error.message : error);
//         }
//     });
// }

readFileContent = (src, i, clientUtility, filesInfo) => {
    return new Promise(async (resolve, reject) => {
        try {
            let path = ""
            const placeHolders = { ...clientUtility.activityDetails.placeHolders, ... { FileTypeName: filesInfo.data[i].name } }
            src = getFormattedName(src, placeHolders)
            // path = extendedJoin([clientUtility.pathDetails.client.path, filesInfo.data[i].name, '/']);
            path = extendedJoin([clientUtility.pathDetails.client.path, '/']);
            path += src
            console.log("path", path)
            if (isPathExist(path)) {
                readSmallFile(path).then(async (data) => {
                    resolve(data)
                }).catch((error) => {
                    reject("Following mandatory file is missing. " + src)
                })
            } else {
                resolve()
            }
        } catch (error) {
            global.log("readFileContent", error);
            reject(error.message ? error.message : error);
        }
    });
}

updateJobInfoXmlDetails = async (clientUtility, jobInfoResult, incomingDetails, srcFolderBook, srcFolderChapter) => {
    return new Promise(async (resolve, reject) => {
        try {
            let filePayload = {}
            // xml file will arise in chapter folder
            if (srcFolderChapter) {
                filePayload = {

                    // fileIncomingId : clientUtility.activityDetails.fileType.fileId,
                    wfEventId: clientUtility.activityDetails.wfEventId,
                    fileIncomingId: incomingDetails.incomingFileId,
                    uuid: jobInfoResult.uuid,
                    path: jobInfoResult.path

                }
            }
            // xml file will arise in book folder
            if (srcFolderBook) {
                filePayload = {
                    fileIncomingId: incomingDetails.incomingFileId,
                    wfEventId: clientUtility.activityDetails.wfEventId,
                    uuid: jobInfoResult.uuid,
                    path: jobInfoResult.path

                }
            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.jobInfoDetailsUpdate}`, filePayload, headers);
            global.log("File copied successfully for jobinfo details", details);
            resolve();
        } catch (error) {
            global.log("file copied successfuly for jobinfo details", error);
            reject(error.message ? error.message : error);
        }
    });
}

updateTemplateFileDetails = async (filesInfo, clientUtility, jobInfoResult, type) => {
    return new Promise(async (resolve, reject) => {
        console.log(filesInfo, "filesInfo")
        try {
            const filePayload = {
                fileIncomingId: filesInfo.incomingFileId,
                wfEventId: clientUtility.activityDetails.wfEventId,
                uuid: jobInfoResult.uuid,
                path: jobInfoResult.path,
                fileName: jobInfoResult.filename ? jobInfoResult.filename : ""

            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            var details;
            if (type == 'update') {
                details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.TemplateDetailsUpdate}`, filePayload, headers);
            } else {
                details = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.TemplateDetailsDelete}`, filePayload, headers);

            }
            global.log("File updated successfully for template", details);
            resolve();
        } catch (error) {
            global.log("file updated error for template upload", error);
            reject(error.message ? error.message : error);
        }
    });
}
internalShippingFile = async (clientUtility, custom) => {
    return new Promise(async (resolve, reject) => {
        try {
            const filePayload = {
                woId: clientUtility.activityDetails.workOrderId,
                wfDefId: clientUtility.activityDetails.wfDefId,
                srcWfDefId: custom.srcWfdefId,
                srcFileExt: custom.srcFileExt,
                wfEventId: clientUtility.activityDetails.wfEventId,
                basePath: clientUtility.activityDetails.basePath,
                duname: clientUtility.activityDetails.du.name,
                duid: clientUtility.activityDetails.du.id,
                customername: clientUtility.activityDetails.customer.name,
                customerid: clientUtility.activityDetails.customer.id,
                servicename: clientUtility.activityDetails.service.name,
                serviceid: clientUtility.activityDetails.service.id,
                instanceType: clientUtility.activityDetails.instanceType,
                dmsType: clientUtility.activityDetails.dmsType

            }
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const fileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.internalShippingFile}`, filePayload, headers);
            global.log("File copied successfully", fileDetails);
            if (fileDetails.length > 0) {
                for (let index = 0; index < fileDetails.length; index++) {
                    const element = fileDetails[index];
                    let isFolder = element.destBasePath.replace(clientUtility.activityDetails.basePath, "") ? element.destBasePath.replace(foldername, "") : element.destBasePath.replace(clientUtility.activityDetails.basePath, "");
                    isFolder = isFolder && isFolder.length > 0 ? true : false
                    let destBasePath = isFolder && (basename(element.srcPath) != 'book_1') ? extendedJoin([clientUtility.pathDetails.client.path, element.destBasePath, '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                    if (clientUtility.filesDownload.filter(x => basename(x.srcPath) == basename(element.srcPath)).length == 0) {
                        clientUtility.filesDownload.push({ src: element.src, destBasePath, name: element.name, srcPath: element.srcPath });
                    }
                }
            }
            resolve();

        } catch (error) {
            global.log("copy pagetarget folder", error);
            reject(error.message ? error.message : error);
        }
    });
}


module.exports = {
    preProcessing, retreiveOKMFiles, getGraphicIterationDetails
};
