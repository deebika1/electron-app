const { config } = require('../../config/index');
const { mode } = require('../../config/env.json');
const okmHelper = require('./../utils/okm');
const azureHelper = require('./../utils/azure');
const { extendedJoin, rename, removeFile, isPathExist } = require('./../utils/io');
const { getChecksum } = require('./../utils/index');
const { dirname, basename } = require('path');

class AutoUpdater {
    versionDetails = {
        utility: {
            version: null,
            major: null,
            minor: null
        },
        iwms: {
            version: null,
            major: null,
            minor: null
        }
    };

    fileDetails = {
        new: null,
        old: null,
        temp: null
    }

    isLatestVersion = false;
    clientUtility = null;

    constructor(clientUtility) {
        this.clientUtility = clientUtility;
        this.parseVersionDetails();
    }

    async process(isBuildMismatched) {
        return new Promise(async (resolve, reject) => {
            try {
                if (isBuildMismatched) {
                    global.log(`Client Utility build Mismatched (Expected - ${mode}, actual - ${global.MODE})`);
                    await this.clientUtility.updateStatusToServer({ message: `Client Utility build Mismatched (Expected - ${mode}, actual - ${global.MODE})`, progress: 30 }, 2);
                } else {
                    global.log(`New Version Found (V${this.versionDetails.iwms.version})`);
                    await this.clientUtility.updateStatusToServer({ message: `New Version Found (V${this.versionDetails.iwms.version})`, progress: 30 }, 2);
                }
                global.log(`upgrading Client Utility to latest version (V${this.versionDetails.iwms.version})`);
                await this.clientUtility.updateStatusToServer({ message: `Upgrading Client Utility (V${this.versionDetails.iwms.version})`, progress: 35 }, 2);
                this.fetchFileDetails();
                await this.clientUtility.updateStatusToServer({ message: `Downloading Client Utility (V${this.versionDetails.iwms.version})`, progress: 40 }, 2);
                await this.downloadUpdate();
                await this.clientUtility.updateStatusToServer({ message: `Downloaded Client Utility (V${this.versionDetails.iwms.version})`, progress: 80 }, 2);
                await this.checkHashChanges();
                await this.processUpdate();
                await this.clientUtility.updateStatusToServer({ message: `Upgraded Client Utility to latest version (V${this.versionDetails.iwms.version})`, progress: 90 }, 2);
                this.clientUtility.customMessage = `Upgraded Client Utility to latest version (V${this.versionDetails.iwms.version})`;
                global.log(`Upgraded Client Utility to latest version (V${this.versionDetails.iwms.version})`, 1);
                resolve();
            } catch (err) {
                global.log(err);
                reject(err);
            }
        });
    }

    checkForUpdate() {
        return !(this.isLatestVersion);
    }

    fetchFileDetails() {
        const { clientUtility } = config;
        const oldFolderName = `${clientUtility.softwareNames.windows.name}${clientUtility.softwareNames.windows.ext}`;
        this.fileDetails.old = extendedJoin([clientUtility.baseFolder, oldFolderName]);

        const newFolderName = `${clientUtility.softwareNames.windows.name}_new${clientUtility.softwareNames.windows.ext}`;
        this.fileDetails.new = extendedJoin([clientUtility.baseFolder, newFolderName]);

        const tempFolderName = `${clientUtility.softwareNames.windows.name}_temp${clientUtility.softwareNames.windows.ext}`;
        this.fileDetails.temp = extendedJoin([clientUtility.baseFolder, tempFolderName]);
    }

    async downloadUpdate() {
        return new Promise(async (resolve, reject) => {
            try {
                let source = config.clientUtility.getSoftwareSource();
                let dest = extendedJoin([dirname(this.fileDetails.new), '/']);
                let baseName = basename(this.fileDetails.new);
                await azureHelper.downloadFile(source, dest, baseName);
                //switch (this.clientUtility.activityDetails.dmsType) {
                //    case "azure":
                //        await azureHelper.downloadFile(source, dest, baseName);
                //        break;
                //    default:
                //        const uuid = await okmHelper.getUuid(source);
                //        await okmHelper.downloadFile(uuid, dest, baseName);
                //        break;
                //}
                resolve();
            } catch (error) {
                reject(error);
            }
        })

    }

    async checkHashChanges() {
        if (process.env.ELECTRON_RUNNER != "true") {
            const oldCheckSum = await getChecksum(this.fileDetails.old);
            const newCheckSum = await getChecksum(this.fileDetails.new);
            if (oldCheckSum == newCheckSum) {
                throw `Latest Client Utility source (${this.versionDetails.iwms.version}) not found.`;
            }
        }
    }

    async processUpdate() {
        if (isPathExist(this.fileDetails.temp)) await removeFile(this.fileDetails.temp);
        await rename(this.fileDetails.old, this.fileDetails.temp);
        await rename(this.fileDetails.new, this.fileDetails.old);
    }

    parseVersionDetails() {
        this.versionDetails.utility.version = config.clientUtility.getVersion();
        const currentSplittedVersion = this.versionDetails.utility.version.split('.');
        this.versionDetails.utility.major = currentSplittedVersion[0];
        this.versionDetails.utility.minor = currentSplittedVersion[1];


        this.versionDetails.iwms.version = this.clientUtility.version;
        const expectedSplittedVersion = this.versionDetails.iwms.version.split('.');
        this.versionDetails.iwms.major = expectedSplittedVersion[0];
        this.versionDetails.iwms.minor = expectedSplittedVersion[1];

        this.isLatestVersion = this.versionDetails.iwms.major == this.versionDetails.utility.major && this.versionDetails.iwms.minor == this.versionDetails.utility.minor
        global.log(this.versionDetails, 'versionDetails');
    };
}

module.exports = {
    AutoUpdater
};