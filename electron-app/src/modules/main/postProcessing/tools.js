const { APIConfig } = require('../../../config/api');
const { config } = require('../../../config/index');
const { post } = require('../../../modules/http/index');
const fs = require("fs");
const { isPathExist,removeFile,removeDir } = require('../../utils/io.js');
const path = require('path');
const JSZip = require('jszip'); 


const getToolDetails = (clientUtility, toolId) => {
    
    return new Promise(async (resolve, reject) => {
        try {
            const payload = {
                wfDefId: clientUtility.activityDetails.wfDefId,
                toolsId: toolId,
                wfeventId: clientUtility.activityDetails.wfEventId
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const toolDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.onsaveGetToolsDetails}`, payload, headers);
            global.log(toolDetails[0], 'get Tool Details');
            resolve(toolDetails[0]);

        }
        catch (e) {
            global.log(e, 'getToolsDetail error');
            reject(e);
        }
    });
}

const invokeTools = (toolsresponse, clientUtility, payload,toolsCustom) => {
    return new Promise(async (resolve, reject) => {
        try {
            const workorderDetails = {
                du: { name: clientUtility.activityDetails.du.name, id: clientUtility.activityDetails.du.id },
                customer: { name: clientUtility.activityDetails.customer.name, id: clientUtility.activityDetails.customer.id },
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: { name: clientUtility.activityDetails.service.name, id: clientUtility.activityDetails.service.id },
                stage: { name: clientUtility.activityDetails.stage.name, id: clientUtility.activityDetails.stage.id, iteration: clientUtility.activityDetails.stage.iteration },
                activity: { name: clientUtility.activityDetails.activity.name, id: clientUtility.activityDetails.activity.id, iteration: clientUtility.activityDetails.activity.iteration },
                fileId: clientUtility.activityDetails.woincomingfileid
            };
            const invokeDetailspayload = {
                toolId: toolsresponse.id,
                wfeventId: clientUtility.activityDetails.wfEventId,
                config: toolsresponse.config,
                apiConfig: toolsresponse.apiConfig,
                isAsync: toolsresponse.isAsync,
                userId: payload.userid,
                placeHolders: clientUtility.activityDetails.placeHolders,
                workorderDetails,
                workorderId: payload.workorderId,
                jobId: payload.jobId,
                stageName: payload.stageName,
                activityName : payload.activityName,
                toolsCustom:toolsCustom,
                sId: clientUtility.sid,
                customerId : clientUtility.activityDetails.customer.name,
                customerName : clientUtility.activityDetails.customer.id,
                woIncomingFileId : clientUtility.activityDetails.woincomingfileid ? clientUtility.activityDetails.woincomingfileid : null,
                tooloutputid : toolsresponse.tooloutputid,
                iAuthor:{},
                dmsType: clientUtility.activityDetails.dmsType || "openkm",
                isUICall : false,
                onSave:true,
                activityId : clientUtility.activityDetails.activity.id,
                wfDefid : clientUtility.activityDetails.wfDefId,
                actualActivityCount :clientUtility.activityDetails.activity.actualactivitycount ,
                articleOrderSequence : clientUtility.activityDetails.articleOrderSequence 

            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            await clientUtility.updateStatusToServer({ message: 'On Save validation in process', progress: 85 }, 2);
            const toolDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.invokeTools}`, invokeDetailspayload, headers);
            await clientUtility. updateStatusToServer({ message: 'On Save validation in process', progress: 90 }, 2);
            global.log(toolDetails, 'invokeTOOLS');
            resolve(toolDetails);
        }
        catch (e) {
            global.log(e, 'Invoking tools failed');
            reject(e.message ? e.message : e);
        }
    });

}

const isNullorUndefined = (data) => {
    return data == null || data == undefined || data.toString() == '';
}
const checkDirectorySync = (directory) => {
    try {
        fs.statSync(directory);
    } catch (e) {
        fs.mkdirSync(directory, { recursive: true });
    }
}
const extractZip = (filePath , fileExn) => {
    return new Promise(async (resolve, reject) => {
        try { 
            const path = require("path"); 
            var JSZip = require('jszip');
            var _path = path.dirname(filePath);
            let isExist = isPathExist(filePath);
            if(isExist){
                fs.readFile(filePath, function (err, data) {
                    if (!err) {
                        var zip = new JSZip();
                        var folerToExtract = path.parse(filePath).name;
                        JSZip.loadAsync(data).then(async function (zip) {
                            for (let i = 0; i < Object.keys(zip.files).length; i++) {
                                let filename = Object.keys(zip.files)[i];
                                let dest = filename.includes('cams_pkg') ? path.join(_path, filename):path.join(_path,folerToExtract, filename);
                                if(zip.files[filename].dir == true){
                                    checkDirectorySync(dest);
                                }else{
                                checkDirectorySync(path.dirname(dest));
                                //if (path.extname(dest) != '')
                                    await zip.file(filename).async('nodebuffer').then(function (content) {
                                        fs.writeFileSync(dest, content);
                                        if(filename.includes('.xhtml')){
                                            if(content.toString().includes(global.failurePatternCV)) { global.isContentValidationStatus = true; }
                                              else if(content.toString().includes(global.successPatternCV)){ global.isContentValidationStatus = false; }
                                        }
                                    }).catch(err => {
                                        reject(err); 
                                    });
                                }
                            }
                            resolve(true);
                        }).catch(err => {
                            reject(err);
                        });
                    }else{
                        reject(err)
                    }
                });
            }else{
                resolve(true)
            }
    
        } catch (error) {
            reject(error);
        }
    });
}
const extractWithoutZipName = (filePath , fileExn) => {
    return new Promise(async (resolve, reject) => {
        try { 
            const path = require("path"); 
            var JSZip = require('jszip');
            var _path = path.dirname(filePath);
            let isExist = isPathExist(filePath);
            if(isExist){
                fs.readFile(filePath, function (err, data) {
                    if (!err) {
                        var zip = new JSZip();
                        var folerToExtract = path.parse(filePath).name;
                        JSZip.loadAsync(data).then(async function (zip) {
                            for (let i = 0; i < Object.keys(zip.files).length; i++) {
                                let filename = Object.keys(zip.files)[i];
                                let dest = path.join(_path, filename);
                                if(zip.files[filename].dir == true){
                                    checkDirectorySync(dest);
                                }else{
                                checkDirectorySync(path.dirname(dest));
                                    await zip.file(filename).async('nodebuffer').then(function (content) {
                                        fs.writeFileSync(dest, content);
                                        if(filename.includes('.xhtml')){
                                            if(content.toString().includes(global.failurePatternCV)) { global.isContentValidationStatus = true; }
                                              else if(content.toString().includes(global.successPatternCV)){ global.isContentValidationStatus = false; }
                                        }
                                    }).catch(err => {
                                        reject(err); 
                                    });
                                }
                            }
                            resolve(true);
                        }).catch(err => {
                            reject(err);
                        });
                    }else{
                        reject(err)
                    }
                });
            }else{
                resolve(true)
            }
    
        } catch (error) {
            reject(error);
        }
    });
}

const createZipAndDeleteSourceFiles = (sourcePath, destinationPath) => {
    return new Promise(async (resolve, reject) => {
        try {
            const path = require("path"); 
            var JSZip = require('jszip');
            var zip = new JSZip();
            const addFileToZip = async (filePath, zipFolder, basePath) => {
                const stats =  fs.statSync(filePath);
                if (stats.isDirectory()) {
                    const files =  fs.readdirSync(filePath);
                    for (const file of files) {
                        await addFileToZip(path.join(filePath, file), zipFolder, basePath);
                    }
                } else {
                    const relativePath = path.relative(basePath, filePath);
                    const fileData =  fs.readFileSync(filePath);
                    zipFolder.file(relativePath, fileData);
                }
            };
            const deleteFolderRecursive = async (folderPath) => {
                const entries =  fs.readdirSync(folderPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(folderPath, entry.name);
                    // Skip the ZIP file to avoid deleting it
                    if (fullPath === path.resolve(destinationPath)) {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        await deleteFolderRecursive(fullPath); // Recursive call for directories
                    } else {
                         await removeFile(fullPath); // Delete file
                    }
                }
                if (folderPath != path.resolve(sourcePath)) {
                    await removeDir(folderPath); // Remove empty directory and skip sourcePath
                }
            };
            // Add only the contents of the sourcePath to the zip
            const stats =  fs.statSync(sourcePath);
            if (!stats.isDirectory()) {
                return reject(new Error("Source path must be a directory to include its contents."));
            }
            await addFileToZip(sourcePath, zip, sourcePath);
            // Generate the zip file
            const zipContent = await zip.generateAsync({ type: "nodebuffer" });
            fs.writeFileSync(destinationPath, zipContent);
            // Delete the source files and folders, except the ZIP file
            await deleteFolderRecursive(sourcePath);
            console.log(`Zip file created at: ${destinationPath}`);
            resolve(true);
        } catch (error) {
            console.error("Error creating zip file:", error.message);
            reject(error);
        }
    });
};

//added by vaithi

const acsExtractZip = (filePath, fileExn, isExtractInRoot) => {
    return new Promise(async (resolve, reject) => {
        try { 
            const path = require("path"); 
            const fs = require('fs');
            const JSZip = require('jszip');
            const _path = path.dirname(filePath);
            const zipfileName = path.basename(_path);
            let isExist = isPathExist(filePath);
            if(isExist){
                fs.readFile(filePath, function(err, data) {
                    if (err) throw err;

                    JSZip.loadAsync(data).then(async function(zip) {
                        if (isExtractInRoot) {
                            // If flag is 'extractinRoot', extract to 'images/' folder
                            const destFolderPath = path.join(_path, 'Images');
                            fs.mkdirSync(destFolderPath, { recursive: true });
                            
                            Object.keys(zip.files).forEach(async function(filename) {
                                if (!zip.files[filename].dir) {
                                    const destFilePath = path.join(destFolderPath, filename); 
                                
                                    fs.mkdirSync(path.dirname(destFilePath), { recursive: true });

                                    await zip.files[filename].async('nodebuffer').then(async function(content) {
                                        fs.writeFileSync(destFilePath, content);
                                    });
                                }
                            });
                            if (isPathExist(filePath)) {
                                await removeFile(filePath)
                            }
                        } else {
                            //extract based on the zip file name
                            Object.keys(zip.files).forEach(async function(filename) {
                                if (filename.startsWith(zipfileName) && !zip.files[filename].dir) {
                                    const destFilePath = path.join(_path, filename.replace(zipfileName, ''));
                                    

                                    fs.mkdirSync(path.dirname(destFilePath), { recursive: true });

                                    await zip.files[filename].async('nodebuffer').then(async function(content) {
                                        fs.writeFileSync(destFilePath, content);
                                    });
                                }
                            });
                        }
                    }).catch(function(err) {
                        console.error('Error reading zip file:', err);
                    });
                    
                });
                resolve(true)
            }else{
                resolve(true)
            }

        } catch (error) {
            reject(error);
        }
    });
}


const onsavetoolsValidation = async (clientUtility, payload, toolId) => {
    global.log(toolId,"ONN");
     return new Promise(async (resolve, reject) => {
        try {
            var invokePayload = await getToolDetails(clientUtility, toolId.toolId)
            var toolsResponse2 = await invokeTools(invokePayload, clientUtility, payload,toolId)
            await clientUtility.updateStatusToServer({ message: 'On Save validation in process', progress: 90 }, 2);
            if(Object.keys(toolsResponse2).length > 0 && toolsResponse2){ 
            if(!invokePayload.isAsync){
                var toolsResponse=toolsResponse2
                console.log(toolsResponse,"EE")
                const remarks = (!isNullorUndefined(toolsResponse.data.data) && (Object.prototype.toString.call(toolsResponse.data.data) == '[object String]' || Object.prototype.toString.call(toolsResponse.data.data) == '[object Boolean]')) ?
                    toolsResponse.data.data : (!isNullorUndefined(toolsResponse.data.message) && (Object.prototype.toString.call(toolsResponse.data.message) == '[object String]' || Object.prototype.toString.call(toolsResponse.data.message) == '[object Boolean]')) ? toolsResponse.data.message : (toolsResponse.data.data || toolsResponse.data.message || 'Remarks missing')
                    if(toolsResponse.data.data == "Skull not available in the PDF") resolve(toolsResponse);
                    //else if( toolsResponse2.message=='On Save Validation Completed')resolve()
                    else throw toolsResponse.data.data
                    resolve(toolsResponse);
            }else{
                var toolsResponse=toolsResponse2.toolsResponse ? toolsResponse2.toolsResponse : toolsResponse2
                console.log(toolsResponse,"EE")
                const remarks = (!isNullorUndefined(toolsResponse.data.data) && (Object.prototype.toString.call(toolsResponse.data.data) == '[object String]' || Object.prototype.toString.call(toolsResponse.data.data) == '[object Boolean]')) ?
                    toolsResponse.data.data : (!isNullorUndefined(toolsResponse.data.message) && (Object.prototype.toString.call(toolsResponse.data.message) == '[object String]' || Object.prototype.toString.call(toolsResponse.data.message) == '[object Boolean]')) ? toolsResponse.data.message : (toolsResponse.data.data || toolsResponse.data.message || 'Remarks missing')
                    if(toolsResponse.data.data == "Skull not available in the PDF") resolve();
                  //  else if (toolsResponse.data.message == 'Bits Validation process started') resolve();
                    else if( toolsResponse2.data.message=='On Save Validation Completed')resolve();
                    //else if (toolsResponse2.data.message == 'Bits Validation process started') resolve();
                     
                    else throw toolsResponse.data.data
                    resolve(toolsResponse);
            }
           
        } 
        else throw ('On Save Validation Failed')
}
        catch (err) {
            reject(err)
        }
    
    })
}

module.exports = {
    onsavetoolsValidation,
    extractZip,
    acsExtractZip,
    extractWithoutZipName,
    createZipAndDeleteSourceFiles
}