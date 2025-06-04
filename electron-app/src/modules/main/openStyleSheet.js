const { isPathExist, retreiveLocalFiles, extendedJoin, getFormattedName, resolveToNormalPath, resolveToWinPath } = require('../utils/io');
const { getChecksum } = require('../utils/index');
const { dirname, basename, parse, extname, join } = require('path');
const okmHelper = require('../utils/okm');
const azureHelper = require('../utils/azure');
const softwareHelper = require('./../utils/software');
const { post } = require('../http/index');
const pLimit = require('p-limit');
const limit = pLimit(75);
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { isRunning } = require('../utils/process');
const { userInfo } = require("os");
const micromatch = require('micromatch');
const localHelper = require('../utils/local');
const actions = { save: 'save', reject: 'reject', pending: 'pending', isCompulsoryCheck: 'isCompulsoryCheck' };


class openStyleSheet {
    clientUtility = null;
    fileStatus = {
        download: [],
        downloaded: [],
        new: []
    };
    software = {
        detail: {},
        appId: null,
        path: null,
        config: {}
    }
    openSoftwareWithoutFiles = null;
    softwareSupportingFiles = [];
    filesInfo = {
        ext: null,
        formattedExt: [],
        actFileMapId: null,
        appId: null,
        data: [],
        missedFiles: []
    };

    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }

    startProcess(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.openStyleSheet(payload);
                resolve();
            } catch (err) {
                global.log(err, 'OpenFiles');
                const errorMessage = err?.message;
                if (typeof errorMessage === "string" && errorMessage.includes("Cannot read properties of undefined (reading 'folderPath')")) {
                    reject("Stylesheet not available for this journal");
                } else {
                    reject(err);
                }
            }
        });
    }

    async SoftwareCloseValidation() {
        if (this.software && this.software.detail && this.software.detail.appname) {
            switch (this.software.detail.appname.toLowerCase()) {
                case "3b2":
                    if (await isRunning("APP.exe")) {
                        throw new Error("Please close the Arbortext APP (3b2).");
                    }
                    break;
                default:
                    break;
            }
        }
    }

    async downloadFiles() {
        return new Promise(async (resolve, reject) => {
            try {
                const progressDetails = {
                    currentProgress: 50,
                    fileProgress: 40 / this.fileStatus.download.length,
                    completedFileCount: 0,
                    totalFileCount: this.fileStatus.download.length
                }
                if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloading Files', progress: 50 }, 2);
                if (this.fileStatus.download.length) {
                    for (let i = 0; i < this.fileStatus.download.length; i++) {
                        const file = this.fileStatus.download[i];
                        await this.updateDownloadProgressDetails(file, progressDetails, true);
                        await this.downloadFile(file);
                        await this.updateDownloadProgressDetails(file, progressDetails, false);
                    }
                }
                if (this.fileStatus.download.length) await this.clientUtility.updateStatusToServer({ message: 'Downloaded Files', progress: 90 }, 2);
                resolve();
            } catch (error) {
                const errorMessage = error?.message;

                if (typeof errorMessage === "string" && errorMessage.includes("Error occured in copying file")) {
                    reject("The file is already open. Please close it and try again");
                } else {
                    reject(error.message);
                }
            }

        })
    }

    downloadFile(fileData) {
        return new Promise(async (resolve, reject) => {
            try {
                const { folderPath, name, uuid, path } = fileData;
                const os = require('os');
                switch (this.clientUtility.activityDetails.dmsType) {
                    case "azure":
                        await azureHelper.downloadFile(path, folderPath, name);
                        break;
                    case "local":
                        if (os.platform() == "win32") {
                            await localHelper.downloadLocalFileWithImpersonator(path, parse(folderPath).dir, basename(folderPath));
                        }
                        else {
                            await localHelper.downloadlocalFile(path, parse(folderPath).dir, basename(folderPath));
                        }
                        break;
                    default:
                        await okmHelper.downloadFile(uuid, folderPath, name);
                        break;
                }
                resolve()
            } catch (error) {
                reject(error);
            }
        })
    }
    async openStyleSheet(payload) {

        let fileCopyFromCommon = this.clientUtility.activityDetails.config.isstylesheetpath;

        if (fileCopyFromCommon.length > 0) {
            await this.styleSheetFilesDownloadLocal(this.clientUtility, fileCopyFromCommon, true, payload)
        } else {

        }

    }

async openFile(fileData, payload) {
    try {
        if (!Array.isArray(fileData) || fileData.length === 0 || !fileData[0]) {
            throw new Error("Stylesheet not available for this journal.");
        }

        const { folderPath, name } = fileData[0];

        if (!folderPath || !name) {
            throw new Error("Missing file path or name.");
        }

        const filePath = extendedJoin([folderPath, name]);
        await this.openFileInSoftware(filePath, payload);
        
        return true;

    } catch (error) {
        console.error("Error opening file:", error);

        const errorMessage = error?.message;

        if (typeof errorMessage === "string" && errorMessage.includes("Error occured in copying file")) {
            throw new Error("The file is already open. Please close it and try again.");
        } else {
            throw new Error(errorMessage || "An unexpected error occurred while opening the file.");
        }
    }
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

    async openFileInSoftware(path, payload) {
        let extName = path;
        this.software.path = await this.getSoftwarePath(payload.activityDetails.softwareTool[0].appurlpath, '.pdf');
        if (extName) {
            softwareHelper.openFile(path, this.software.path);
        }
    }

    async getSoftwarePath(softwarePath, ext) {
        if (softwarePath) {
            const path = await softwareHelper.getSoftwarePath(softwarePath);
            if (path) {
                return path;
            } else {
                throw `No software found to open the file (${ext})`;
            }
        } else {
            throw `No software was not mapped to open the file (${ext})`;
        }
    }

    async styleSheetFilesDownloadLocal(clientUtility, styleSheetCopy, isOverWritePrint = false, payload) {
        return new Promise(async (resolvce, reject) => {
            try {

                let stylesheetpath = Object.keys(clientUtility.activityDetails.placeHolders).includes('filename') && clientUtility.activityDetails.placeHolders.filename != null ? styleSheetCopy
                    .replace(';;JournalAcronym;;', clientUtility.activityDetails.placeHolders.JournalAcronym) : styleSheetCopy
                let RetreiveBlobFilesURLs = '';

                if (clientUtility.activityDetails.dmsType == 'azure') {
                    // RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(stylesheetpath); 
                } else {
                    RetreiveBlobFilesURLs = await localHelper.getRetreivelocalFilesURL(stylesheetpath)

                };

                if (RetreiveBlobFilesURLs && RetreiveBlobFilesURLs.length > 0) {
                    RetreiveBlobFilesURLs.forEach(async (ele) => {
                        let destBasePath = extendedJoin([clientUtility.pathDetails.client.path]);
                        let name = basename(ele.path)
                        this.fileStatus.download.push({ uuid: ele.uuid, folderPath: destBasePath, name, path: ele.path });
                    })
                }
                await this.downloadFiles();
                await this.openFile(this.fileStatus.download, payload);
                resolvce(true)
            } catch (error) {
                const errorMessage = error?.message;
                if (typeof errorMessage === "string" && errorMessage.includes("Cannot read properties of undefined (reading 'folderPath')")) {
                    reject("Stylesheet not available for this journal");
                } else {
                    reject(error);
                }
            }

        })

    }
}

module.exports = {
    openStyleSheet
};
