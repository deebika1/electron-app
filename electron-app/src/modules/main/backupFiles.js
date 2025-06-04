const { post } = require('../http/index');
const { extendedJoin } = require('../utils/io');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const azureHelper = require('../utils/azure');
const localHelper = require('../utils/local')
const { getChecksum } = require('../utils/index');
const { basename,parse,join} = require("path");
const { existsSync,statSync } = require('fs');
const path = require('path');

class BackupFiles {
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
    getFilesizeInBytes(filename) {
        var stats = statSync(filename);
        var fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }
    async startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(payload);
                this.backupFile = payload.backupFile;

                let backupPath = `backup/${this.clientUtility.activityDetails.itemCode}/${this.clientUtility.activityDetails.service.name}/${this.clientUtility.activityDetails.stage.name}/${this.clientUtility.activityDetails.activity.name}/`;
                backupPath = backupPath.replaceAll(' ', '_').toLowerCase();
                const headers = { 'Authorization': `Bearer ${config.server.getToken()}` };
                const basepath = this.clientUtility.activityDetails.basePath;
                const dmsType = this.clientUtility.activityDetails.dmsType;
                const wfEventId = this.clientUtility.activityDetails.wfEventId;
                const filenames = this.backupFile.map(file => file.filename);

                // Single API call to fetch backup details for all files
                const input = { wfeventid: wfEventId, filenames };
                const response = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.getBackupFileDetails}`, input, headers);
                const backupDetailsCache = response.data.reduce((acc, item) => {
                    acc[item.filename] = item.details; // Adjust according to actual response structure
                    return acc;
                }, {});

                let bulkUpdateInputs = [];

                for (const bkFile of this.backupFile) {
                    let srcFile = join(this.clientUtility.pathDetails.client.path, bkFile.filename);
                    if (!existsSync(srcFile) || this.getFilesizeInBytes(srcFile) === 0) continue;

                    let pastBackupDetails = backupDetailsCache[bkFile.filename] || [];
                    let okmCheckPath = pastBackupDetails.length > 0 ? pastBackupDetails[0].path : undefined;
                    let hasUpdated = true;

                    if (okmCheckPath) {
                        const srcChecksum = await getChecksum(srcFile).catch(() => undefined);
                        let destCheckSum;

                        const normalizedBasePath = path.normalize(basepath).replace(/\\/g, "/");
                        const normalizedCheckPath = path.normalize(okmCheckPath).replace(/\\/g, "/");

                        const finalCheckPath = normalizedCheckPath.startsWith(normalizedBasePath)
                            ? normalizedCheckPath
                            : path.join(normalizedBasePath, path.relative(normalizedBasePath, normalizedCheckPath));

                        switch (this.clientUtility.activityDetails.dmsType) {
                            case 'azure':
                                destCheckSum = await azureHelper.getChecksum(normalizedCheckPath).catch(() => undefined);
                                break;
                            case 'local':
                                destCheckSum = await localHelper.getlocalChecksum(finalCheckPath).catch(() => undefined);
                                break;
                            default:
                                break;
                        }


                        if (srcChecksum && destChecksum && srcChecksum === destChecksum) {
                            hasUpdated = false;
                        }
                    }

                    if (hasUpdated) {
                        if (bkFile.limit <= pastBackupDetails.length) {
                            pastBackupDetails = pastBackupDetails.slice(bkFile.limit - 1);
                        } else {
                            pastBackupDetails = [];
                        }

                        for (const toDelete of pastBackupDetails) {
                            switch (dmsType) {
                                case 'azure':
                                    await azureHelper.deleteFile(toDelete.path);
                                    break;
                                case 'local':
                                    await localHelper.deletelocalFile(toDelete.path);
                                    break;
                            }
                        }

                        const baseName = bkFile.filename.replace(parse(bkFile.filename).ext, "");
                        const distPath = `${backupPath}${wfEventId}/`;
                        const timestampedFile = `${baseName}_${(new Date().toJSON()).replace(/:/g, ".")}${parse(bkFile.filename).ext}`;
                        let output;

                        switch (dmsType) {
                            case 'azure':
                                output = await azureHelper.uploadNewFile(srcFile, distPath, timestampedFile);
                                break;
                            case 'local':
                                output = await localHelper.uploadlocalNewFile(srcFile, `${basepath}${distPath}`, timestampedFile);
                                break;
                        }

                        bulkUpdateInputs.push({
                            wfeventid: wfEventId,
                            filename: bkFile.filename,
                            path: output.path,
                            rowlimit: bkFile.limit
                        });
                    }
                }

                // Perform bulk update if there are updates
                if (bulkUpdateInputs.length > 0) {
                    await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.tools.updateBulkBackupFile}`, bulkUpdateInputs, headers);
                }

                resolve();

            } catch (error) {
                reject(error);
            }
        });
    }
}
module.exports = {
    BackupFiles
};