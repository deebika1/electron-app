const { getRetreiveBlobFilesURL, httpDownload } = require("../utils/azure.js");
const { basename, dirname, join } = require('path');
const { statSync, mkdirSync } = require('fs');

class DownloadBlobFiles {
    constructor(clientUtility) {
        this.clientUtility = clientUtility;
    }
    async startProcess(payload) {
        return new Promise(async (resolve,reject)=>{
            try {
                this.localPath = process.env.USERPROFILE + "\\Downloads\\" + payload.bookCode.itemcode + "\\" + payload.name;
                if (payload.blobPath) {
                    this.blobPath = payload.blobPath;
                    let awt = [], i = 0;
                    let RetreiveBlobFilesURLs = await getRetreiveBlobFilesURL(this.blobPath.replace("/okm:root/", ""));
                    for (let index = 0; index < RetreiveBlobFilesURLs.length; index++) {
                        const element = RetreiveBlobFilesURLs[index].path.replace("/okm:root/", "");
                        let BlobPath = (element.includes(this.blobPath)) ? element.replace(this.blobPath, "") : element;
                        let LocalPath = join(this.localPath, BlobPath);
                        this.checkDirectorySync(dirname(LocalPath));
                        awt.push(httpDownload({ "path": RetreiveBlobFilesURLs[index].downloadPath }, dirname(LocalPath), basename(LocalPath)).then(async () => {
                            i++;
                            await this.clientUtility.updateStatusToServer({ message: `${basename(this.localPath)} copied.`, progress: i }, 2);
                        }));
                    }
                    await Promise.all(awt);
                   // await this.clientUtility.updateStatusToServer({ message: `${basename(this.localPath)} copied.`, progress: 100 }, 1);
                   await this.clientUtility.updateStatusToServer({ message: 'success' }, 2);
                    resolve();

                } else {
                    await this.clientUtility.updateStatusToServer({ message: `${basename(this.localPath)} copied.`, progress: 100 }, 1);
                    resolve();
                }
            } catch (error) {
                reject(error);
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
}

module.exports = {
    DownloadBlobFiles
};