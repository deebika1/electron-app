const { openFolder } = require('../utils/explorer/index');
const { getChecksum } = require('../utils/index');
const { isPathExist, makeDir, extendedJoin, retreiveLocalFiles } = require('../utils/io');
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
const fs = require("fs");
const path = require('path');
const {createZipAndDeleteSourceFiles } = require('./postProcessing/tools');
const { execute } = require('../utils/process');
const OpenExporer = require('./openExplorer');


class ACSerrorhandle {
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
                // const filePath = payload.item.workingFolder;
                // const errorMessage = payload.item.errorMessage;


                if (payload.item.type === 'e2efilecontent') {
                    const { source, dest } = payload.item;
                    await makeDir(dirname(dest));
                    const readStream = fs.createReadStream(source);
                    const writeStream = fs.createWriteStream(dest);
                    readStream.pipe(writeStream);

                    readStream.on('error', (err) => {
                        console.error('Error reading file:', err);
                    });

                    writeStream.on('error', (err) => {
                        console.error('Error writing file:', err);
                    });

                    // Handle finish event to indicate the copy process is complete
                    writeStream.on('finish', async () => {
                        console.log('File copied successfully');
                        await this.clientUtility.updateStatusToServer({ message: "ACS content write complete", progress: 80 }, 2);

                    });

                } else if (payload.item.type === 'generateFileSequence') {
                    const { xmlMessage, workingFolder } = payload.item;

                    await fs.writeFile(workingFolder, xmlMessage, err => {
                        if (err) {
                            console.error('Error writing file:', err);
                            return;
                        }
                        console.log('Data written to file successfully.');
                    });
                    await this.clientUtility.updateStatusToServer({ message: "ACS content write complete", progress: 80 }, 2);

                } else if (payload.item.type === 'els_contentwrite') {
                    const { errorMessage, workingFolder, stageId, workOrderId, xmlContent, xmlFileName, files, serverBasePath, serversourcefileName, localPath, zipPath, msgName, toolId} = payload.item;
                    
                    async function copyFiles(filesdata) {
                        if (filesdata.length > 0) {
                          for (const file of filesdata) {
                            const sourcePath = file.path;
                            const destinationFolder = file.distPath || 'C:/default/destination';
                            const destinationPath = path.join(destinationFolder, file.name);
                      
                            try {
                              // Ensure the destination folder exists
                              await fs.promises.mkdir(destinationFolder, { recursive: true });
                              console.log(`Created directory (if not exists): ${destinationFolder}`);
                            
                              // Copy the file (without deleting the source)
                              await fs.promises.copyFile(sourcePath, destinationPath);
                              console.log(`File copied successfully to ${destinationPath}`);
                            } catch (err) {
                              console.error(`Error copying file: ${err}`);
                            }
                          }
                        } else {
                          console.log("No files to copy.");
                        }
                      }

                    if (files?.length > 0) {
                        try {
                            // Step 1: Copy the files
                            await copyFiles(files);
                        
                            // Step 2: Getting tools info
                            const payload = { toolId: toolId };
                            const headers = { 'Authorization': `Bearer ${config.server.getToken()}` };
                            const toolDetails = await post(
                              `${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getToolDetail}`,
                              payload,
                              headers
                            );
                        
                            // Step 3: Copy tools from server to local
                            const zipToolServerPath = toolDetails.apiconfig.dependentFiles[0].src.replace(/([\\/]\*{2})?[\\/]\*$/, '');
                            const zipToolDistPath = toolDetails.apiconfig.dependentFiles[0].dest;
                            await fs.promises.mkdir(zipToolDistPath, { recursive: true });
                        
                            const toolExeName = 'Problem_task_Zipfile_Creation.exe';
                            const toolExePath = `${zipToolDistPath}/${toolExeName}`;
                            await localHelper.downloadlocalFile(`${zipToolServerPath}/${toolExeName}`, zipToolDistPath, toolExeName);
                            console.log("Dependent files copied successfully.");
                        
                            // Step 4: Execute EXE with retry mechanism
                            const exePath = toolExePath;
                            const distPath = files[0].distPath;
                        
                            const delay = (ms) => new Promise(res => setTimeout(res, ms));
                            const maxRetries = 5;
                            let retryCount = 0;
                        
                            while (retryCount < maxRetries) {
                              try {
                                console.log(`Attempt ${retryCount + 1}: Executing ${exePath}...`);
                                await execute(exePath, [distPath, msgName]);
                                console.log("Zip creation executed successfully.");
                                break;
                              } catch (err) {
                                if (err.code === 'EBUSY') {
                                  console.warn("Executable is busy. Retrying in 1 second...");
                                  retryCount++;
                                  await delay(1000);
                                } else {
                                  throw err;
                                }
                              }
                            }
                        
                            if (retryCount === maxRetries) {
                              throw new Error("Failed to execute EXE after multiple retries.");
                            }
                        
                            // Step 5: Create the server directory if it doesn't exist
                            await fs.promises.mkdir(serverBasePath, { recursive: true });
                            console.log(`Created directory (if not exists): ${serverBasePath}`);
                        
                            // Step 6: Copy the zip file to the server path
                            const sourceZipPath = `${localPath}/${msgName}.zip`;
                            const destinationZipPath = `${serverBasePath}/`;
                            const uploadfile = await localHelper.uploadlocalNewFile(sourceZipPath, destinationZipPath, `${msgName}.zip`);
                            console.log(`File copied successfully to ${destinationZipPath}`);
                        
                            // Step 7: Delete the tool .exe directory and its contents
                            await fs.promises.rm(zipToolDistPath, { recursive: true, force: true });
                        
                            // Step 8: Delete the source zip file if needed (optional)
                            // await fs.promises.unlink(sourceZipPath);
                        
                            // Step 9: Delete the distPath directory and its contents
                            await fs.promises.rm(distPath, { recursive: true, force: true });
                        
                          } catch (error) {
                            console.error("An error occurred while processing files:", error);
                            throw error;
                          }
                      } else {
                        console.log("No files provided to process.");
                      }
                      
                      // Call the function          
                     await fs.writeFile(workingFolder, errorMessage, err => {
                        if (err) {
                            console.error('Error writing file:', err);
                            return;
                        }
                        console.log('Data written to file successfully.');
                    });

                    await fs.writeFile(xmlFileName, xmlContent, err => {
                        if (err) {
                            console.error('Error writing file:', err);
                            return;
                        }
                        console.log('Data written to file successfully.');
                    });
                    await this.clientUtility.updateStatusToServer({ message: "ACS content write complete", progress: 80 }, 2);

                } else if (payload.item.type === 'generatexmlFile') {
                    const { xmlMessage, workingFolder } = payload.item;
                    await fs.promises.mkdir(dirname(workingFolder), { recursive: true });
                    fs.promises.writeFile(workingFolder, xmlMessage, err => {
                        if (err) {
                            console.error('Error writing file:', err);
                            return;
                        }
                        console.log('Data written to file successfully.');
                    });
                    await this.clientUtility.updateStatusToServer({ message: "XML content write complete", progress: 80 }, 2);
                } else if (payload.item.type === 'cup_updatedmetaxml'){
                //    const retreivedFiles = await retreiveLocalFiles(extendedJoin([payload.item.workingFolder, '**', '*']), '');
                //    console.log(retreivedFiles, 'retreivedFiles');
                //   let xmlPath =  retreivedFiles.filter((list) => list.includes('xml_export'));
                  const currentDate = new Date();
                  const formattedDate = currentDate.toISOString().split('T')[0];
                  let destName =`xml_export_${payload.item.itemcode.toLocaleLowerCase()}_${formattedDate}.xml`
                   console.log(payload, 'payload');
                   let filePath =`CUP/Journal/PII/${payload.item?.piiValue}.xml`;
                   let isFileExists = await azureHelper.isFileExist(filePath);
                   if(isFileExists && isFileExists.isFileExist){
                      await azureHelper.downloadFile(filePath, payload.item.workingFolder,destName);
                      await this.clientUtility.updateStatusToServer({ message: "Updated meta xml received", progress: 80 }, 2);
                   }else{
                    await this.clientUtility.updateStatusToServer({ message: "Updated meta xml not received", progress: 80 }, 2);
                   }
               
                }
                else {

                    const { errorMessage, workingFolder, stageId, workOrderId } = payload.item;
                    await fs.writeFile(workingFolder, errorMessage, err => {
                        if (err) {
                            console.error('Error writing file:', err);
                            return;
                        }
                        console.log('Data written to file successfully.');
                    });

                    const filePayload = {
                        errorMessage,
                        workingFolder,
                        stageId,
                        workOrderId,
                    };
                    const headers = {
                        'Authorization': `Bearer ${config.server.getToken()}`
                    };
                    const res = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.acsContentWrite}`, filePayload, headers);
                    await this.clientUtility.updateStatusToServer({ message: "ACS content write complete", progress: 80 }, 2);

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
            eventData: this.clientUtility.activityDetails.eventData

        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, validationFileConfig } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;
    }


}

module.exports = {
    ACSerrorhandle
};