const { post } = require('../http/index');
const { extendedJoin } = require('../utils/io');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local');
const { basename,parse,join} = require("path");
const { existsSync,unlinkSync } = require('fs');
const os = require('os');

class BackupDownload {
    fileStatus = {
        new: [],
        update: [],
        noChange: [],
        inValid: [],
        requiredFiles: []
    };
    action = null;
    isFileSynced = false;
    fileTypes = [];
    filesInfo = {
        data: [],
        requiredFiles: [],
        missedFileTypeInfo: []
    };
    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }
    async fetchDetails(payload) {
        this.fetchPayoadDetails(payload);
        await this.fetchFileDetails();
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
            eventData: this.clientUtility.activityDetails.eventData


        };
        const headers = {
            'Authorization': `Bearer ${config.server.getToken()}`
        };
        const { filesInfo, filesAdditionalInfo, validationFileConfig, fileTypes } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.getFileDetails}`, filePayload, headers);
        this.filesInfo.data = filesInfo;
        this.fileTypes = fileTypes;
        this.filesInfo.requiredFiles = filesAdditionalInfo.requiredFiles;
        this.filesInfo.missedFileTypeInfo = filesAdditionalInfo.missedFileTypeInfo;
        this.clientUtility.activityDetails.validationFileConfig = validationFileConfig;

    }
    fetchPayoadDetails(payload) {
        const { action } = payload;
        this.action = action;
        this.wf = extendedJoin([this.clientUtility.pathDetails.client.path], false);
        this.clientUtility.activityDetails.placeHolders = { ...this.clientUtility.activityDetails.placeHolders, __WF__: extendedJoin([this.wf]) };
    }
    async startProcess(payload) {
        return new Promise(async (resolve,reject)=>{
            try {
                console.log(payload);
                this.backupDownload = payload.backupDownload;
                let dmsType = this.clientUtility.activityDetails.dmsType;
                for (let index = 0; index < this.backupDownload.length; index++) {
                    const bkFile = this.backupDownload[index];
                    let localFilePath = join(this.clientUtility.pathDetails.client.path, bkFile.filename)
                    if(existsSync(localFilePath)){
                        unlinkSync(localFilePath);
                    }
                    switch(dmsType){
                        case "azure":
                            await azureHelper.downloadFile(bkFile.path,parse(localFilePath).dir,basename(localFilePath));
                            break;
                        case "local":
                            if (os.platform() == "win32") {
                                await localHelper.downloadLocalFileWithImpersonator(bkFile.path, parse(localFilePath).dir, basename(localFilePath));
                            }
                            else {
                                await localHelper.downloadlocalFile(bkFile.path, parse(localFilePath).dir, basename(localFilePath));
                            }
                            break;
                        default:
                            break;  
                    }   
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        });       
    }
}
module.exports = {
    BackupDownload
};