const { OpenFiles } = require('./../modules/main/openFile');
const { openFolder } = require('./utils/explorer/index');
const { Sync } = require('./../modules/main/sync');
const { OpenExporer } = require('./main/openExplorer');
const { ClearActivity } = require('./main/clearActivity');
const { SyncToolsFile } = require('./main/syncToolsFile');
const { ClientTool } = require('./main/clientTool');
const { DownloadFiles } = require('./main/DownloadFiles');
const { ShareFilesync } = require('./main/syncToolsFile');
const { DownloadBlobFiles } = require('./main/downloadBlobFiles');
const { BackupFiles } = require('./main/backupFiles');
const { BackupDownload } = require('./main/backupDownload');
const { ACSerrorhandle } = require('./main/acsErrorContent');
const { AutoOpenFile } = require('./main/autoOpenFile');
const { extname, join } = require('path');
const { openStyleSheet } = require('./../modules/main/openStyleSheet');

const { readdirSync, statSync } = require('fs');
const { getIncomingFileTypeDetails } = require('../modules/main/postProcessing/onSaveValidation')

const { extendedJoin, getFormattedName } = require('./utils/io');
const { getBaseDir, getFormattedClientPath, createHashObject, checkIsInternalConnection } = require('./utils/index');
const { post } = require('./http/index');
const { APIConfig } = require('./../config/api');
const { config } = require('./../config/index');
const { mode } = require('./../config/env.json');
const { AutoUpdater } = require('./../modules/update/index');
const { Reject } = require('./main/reject');


class ClientUtility {
    version = null;
    sid = null;
    type = null;
    mode = null;
    autoUpdater = null;
    customMessage = null;
    updateFileDetails = false;

    activityDetails = {
        wfDefId: null,
        wfId: null,
        wfEventIds: [],
        wfEventId: null,
        placeHolders: null,
        workOrderId: null,
        allowSubFileType: null,
        validationFileConfig: null,
        softwareId: [],
        toolsId: [],
        selectedTool: null,
        fileConfig: {},
        toolsConfig: {},
        softwareConfig: {},
        service: {
            name: null,
            id: null,
            iteration: null,
            basePath: null,
        },
        customer: {
            name: null,
            id: null
        },
        du: {
            name: null,
            id: null
        },
        stage: {
            name: null,
            id: null,
            iteration: null
        },
        activity: {
            name: null,
            id: null,
            iteration: null,
            count: null,
            type: null
        },
        fileId: null,
        fileType: {
            name: null,
            id: null,
            fileId: null
        },
        basePath: null,
        config: {},
        itemCode: null,
        mandatorySaveFile: {},
        eventData: {},
        instanceType: null,
        woType: null,
        dmsType: null,
        isOtherArticle: false,
        articleOrderSequence: "",
        newsletter: false
    };

    pathDetails = {
        okm: {
            path: null
        },
        client: {
            baseDir: null,
            path: null,
            tools: null,
            id: null
        },
        fileMovementConfig: []
    };

    async process(header, payload) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(this.activityDetails);
                this.fetchPayloadDetails(header, payload);
                await this.updateStatusToServer({ message: 'Client Utility connected', progress: 20 }, 2);
                const isBuildMismatched = this.isBuildMismatched();
                this.autoUpdater = new AutoUpdater(this);
                if ((isBuildMismatched || this.autoUpdater.checkForUpdate()) && process.env.ELECTRON_RUNNER != "true") {
                    await this.autoUpdater.process(isBuildMismatched);
                } else {
                    // const eventIds = payload.activityDetails.wfEventId;
                    // const promises = eventIds.map(async (id) => {
                    //     this.activityDetails.wfEventId = id;
                    //     return await this.processEvent(payload);
                    // });

                    // const results = await Promise.all(promises);

                    // console.log("All events processed:", results);

                    const eventIds = payload.activityDetails.wfEventId;
                    for (let i = 0; i < eventIds.length; i++) {
                        try {
                            this.activityDetails.wfEventIds = eventIds;
                            this.activityDetails.wfEventId = eventIds[i];
                            this.activityDetails.index = i;
                            payload.actionType = header.type;
                            const result = await this.processEvent(payload);
                            console.log(result);
                        } catch (error) {
                            console.error(`Error processing event ${eventIds[i]}:`, error);
                            throw error;
                        }
                      }

                    if (payload.isAutoOpenReq) {
                        console.log(this.pathDetails);
                        openFolder(this.pathDetails.client.path);
                    }

                    await this.updateStatusToServer({ message: 'Process completed', progress: 100 }, 2);
                    if (!["file_backup"].includes(this.type))
                        await this.updateStatusToServer(
                            {
                                message: "success",
                                customMessage: this.customMessage,
                                updateFileDetails: this.updateFileDetails,
                            },
                        );
                    resolve();

                }

            } catch (err) {
                global.log(err, 'jjjiiiii  process');
                if (this.sid) {
                    await this.updateStatusToServer({ message: err.message ? err.message : err, updateFileDetails: this.updateFileDetails }, 0);
                }
                reject(err);
            }
        });
    }

    isBuildMismatched() {
        return global.MODE != mode;
    }

    fetchPayloadDetails(header, payload) {
        const { type, sid, version } = header;
        const { activityDetails, isOut } = payload;
        this.isOut = isOut || false;
        if (type && sid && version && activityDetails && activityDetails.wfEventId) {
            this.type = type;
            this.sid = sid;
            this.version = version;
            this.activityDetails.wfEventIds = activityDetails.wfEventId;
            // this.activityDetails.wfEventId = activityDetails.wfEventId;
        } else {
            this.sid = sid ? sid : null;
            throw 'Mandatory fields are missing (type, sid, version, wfEventId)';
        }
    }
    async processEvent(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.fetchPlaceHolders();
                await this.updateStatusToServer({ message: 'Fetching Activity Details ', progress: 20 }, 2);
                await this.fetchActivityDetails(payload);
                // await this.fetchPlaceHolders();
                var fileDetailsInIncoming = await getIncomingFileTypeDetails(this);
                let otherArticleList = fileDetailsInIncoming.filter(list => list.filetypeid == this.activityDetails.fileType.id && list.articletype == 'Other Article')
                let otherArticleList1 = fileDetailsInIncoming.filter(list => list.articletype == 'Other Article')

                // this.activityDetails.isOtherArticle = ((otherArticleList && otherArticleList.length >0  || this.activityDetails.fileType.id == null) && (this.activityDetails.activity.id  != '199' && this.activityDetails.activity.id != '200' &&  this.activityDetails.activity.id != '202' &&
                // this.activityDetails.activity.id != '203')) ? true : false
                if (otherArticleList1 && otherArticleList1.length > 0) {
                    this.activityDetails.isOtherArticle = ((otherArticleList && otherArticleList.length > 0 || this.activityDetails.fileType.id == null) && (this.activityDetails.activity.id != '199' && this.activityDetails.activity.id != '200' && this.activityDetails.activity.id != '202' &&
                        this.activityDetails.activity.id != '203' && this.activityDetails.activity.id != '11')) ? true : false
                } else {
                    this.activityDetails.isOtherArticle = false
                }
                let filteredOtherArticleId =[]
                if(this.activityDetails.isOtherArticle)  {
                        otherArticleList1.map(list =>
                          filteredOtherArticleId.push(parseInt(list.filetypeid)),
                        );
                        filteredOtherArticleId = new Set(filteredOtherArticleId);
                      
                        const ioKeys = this.activityDetails.toolsConfig  && Object.keys(this.activityDetails.toolsConfig).includes('tools') && this.activityDetails.toolsConfig.tools   && Object.keys(this.activityDetails.toolsConfig.tools).length >0 ? Object.keys(this.activityDetails.toolsConfig.tools ) : [];                        for (let j = 0; j < ioKeys.length; j++) {
                        const files = this.activityDetails.toolsConfig  && this.activityDetails.toolsConfig.tools && this.activityDetails.toolsConfig.tools[ioKeys[j]] && Object.keys(this.activityDetails.toolsConfig.tools[ioKeys[j]]).includes('files') && this.activityDetails.toolsConfig.tools[ioKeys[j]].files ? this.activityDetails.toolsConfig.tools[ioKeys[j]].files : [];
                        for (let k=0;k<files.length;k++){
                            let { fileTypes } = files[k];
                            if (fileTypes.includes(83)) {
                              fileTypes = [...fileTypes, ...filteredOtherArticleId];
                              files[k].fileTypes = fileTypes;
                            }
                        }
                       
                      }
                    }
                if (!this.pathDetails.client.path) {
                    await this.fetchPathDetails();
                }
                await this.updateStatusToServer({ message: 'Fetched Activity Details', progress: 30 }, 2);
                await this.processAction(payload);
                resolve(true);

            } catch (err) {
                reject(err);
            }
        });
    }

    async fetchFmConfig(wfDefId) {
        return new Promise(async (resolve, reject) => {
            try {
                const fileMovementConfigUrl = APIConfig.uri.getFileMovementConfig;
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const fileMovementConfigPayload = {
                    flowTo: wfDefId,
                    customerId: this.activityDetails.customer.id,
                    workOrderId: this.activityDetails.workOrderId,
                    wfId: this.activityDetails.wfId
                };
                const { fileMovementConfig } = await post(`${APIConfig.server.getBaseURL()}${fileMovementConfigUrl}`, fileMovementConfigPayload, headers);
                this.fileMovementConfig = fileMovementConfig;
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    async fetchActivityDetails(payload) {
        return new Promise(async (resolve, reject) => {
            try {
                const activityPayload = {
                    wfEventId: this.activityDetails.wfEventId
                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                const { wfDefId, workOrderId, du, customer,
                    activity, stage, service, basePath, softwareId, toolsId, toolsConfig, fileConfig, softwareConfig, fileId, fileTypeId, fileTypeName, allowSubFileType, wfId, pmName, pmEmail, activityConfig, itemCode, instanceType, wotype, dmsType, activityType, issuemstid, isonlineissue, ismscompleted, activitymodeltypeflow, pubflowconfig, articleOrderSequence, newsletter, iscamundaflow, runonfilesequence } = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getActivityDetails}`, activityPayload, headers);
                await this.fetchFmConfig(wfDefId);
                this.activityDetails.wfDefId = wfDefId;
                this.activityDetails.du.id = du.id;
                this.activityDetails.du.name = du.name;
                this.activityDetails.service.id = service.id;
                this.activityDetails.service.name = service.name;
                this.activityDetails.customer.id = customer.id;
                this.activityDetails.customer.name = customer.name;
                this.activityDetails.stage.id = stage.id;
                this.activityDetails.stage.name = stage.name;
                this.activityDetails.stage.iteration = stage.iteration;
                this.activityDetails.stage.basePath = stage.basePath;
                this.activityDetails.activity.id = activity.id;
                this.activityDetails.activity.name = activity.name;
                this.activityDetails.activity.iteration = activity.iteration;
                this.activityDetails.activity.count = activity.count;
                this.activityDetails.activity.actualactivitycount = activity.actualactivitycount;
                this.activityDetails.workOrderId = workOrderId;
                this.activityDetails.basePath = basePath;
                this.activityDetails.softwareId = softwareId;
                this.activityDetails.toolsId = toolsId;
                this.activityDetails.toolsConfig = toolsConfig;
                this.activityDetails.softwareConfig = softwareConfig;
                this.activityDetails.fileConfig = fileConfig;
                this.activityDetails.fileType.fileId = fileId;
                this.activityDetails.fileType.id = fileTypeId;
                this.activityDetails.fileType.name = fileTypeName;
                this.activityDetails.allowSubFileType = allowSubFileType;
                this.activityDetails.wfId = wfId;
                this.activityDetails.pmEmail = pmEmail;
                this.activityDetails.pmName = pmName;
                this.activityDetails.selectedTool = payload.activityDetails.toolId;
                this.activityDetails.config = activityConfig;
                this.activityDetails.itemCode = itemCode;
                this.activityDetails.mandatorySaveFile = payload.mandatorySaveFile ? payload.mandatorySaveFile : {},
                    this.activityDetails.eventData = payload.eventData ? payload.eventData : {}
                this.activityDetails.instanceType = instanceType ? instanceType : null,
                    this.activityDetails.woType = wotype ? wotype : ""
                this.activityDetails.dmsType = dmsType ? dmsType : "openkm",
                    this.activityDetails.woIncomingFileId = fileId
                this.activityDetails.activity.type = activityType;
                this.activityDetails.issuemstid = issuemstid;
                this.activityDetails.isonlineissue = isonlineissue;
                this.activityDetails.ismscompleted = ismscompleted;
                this.activityDetails.activitymodeltypeflow = activitymodeltypeflow;
                this.activityDetails.articleOrderSequence = articleOrderSequence
                this.activityDetails.newsletter = newsletter;
                this.activityDetails.iscamundaflow = iscamundaflow;
                this.activityDetails.runonfilesequence = runonfilesequence;

                if(payload.actionType == 'open_explorer' || payload.actionType == 'open_files' || payload.actionType == 'auto_open_files'){
                //Generate book details custom.
                let GenerateBookDetailsCheckFiles = Object.keys(this.activityDetails.fileConfig?.fileTypes || {}).map(x => this.activityDetails.fileConfig.fileTypes[x].files).flat(1).filter(x => (x.custom || []).filter(x => x.toLocaleLowerCase() === "generate_bookdetails").length > 0);
                let uniqueArray = GenerateBookDetailsCheckFiles.filter((item, index, self) =>
                    index === self.findIndex((t) => t.name === item.name)
                  );
                for (const custom of uniqueArray) {
                    await this.BookDetailsTextForActivites({
                        workOrderId: workOrderId,
                        activityId: activity.id,
                        activityname: activityConfig.displayName,
                        stageId: stage.id,
                        stagename: stage.name,
                        ext: extname(custom.name),
                        type: 'bookdetails',
                        woIncomingFileId : this.activityDetails.woIncomingFileId,
                        activityAlias: activity.activityalias,
                        iterationcount: stage.iteration
                    })
                    this.activityDetails.BookDetails.fileName = custom.name;
                }

                //Generate figure text custom.
                if (!this.activityDetails.iscamundaflow) {
                    let GenerateFigureTxtFiles = Object.keys(this.activityDetails.fileConfig?.fileTypes || {}).map(x => this.activityDetails.fileConfig.fileTypes[x].files).flat(1).filter(x => (x.custom || []).filter(x => x.toLocaleLowerCase() === "generate_graphicstext").length > 0);
                    for (const custom of GenerateFigureTxtFiles) {
                        let filePtah = custom.customFilePath;
                        if (!filePtah) {
                            const data = {
                                customerId: this.activityDetails.customer.id,
                                duId: this.activityDetails.du.id
                            }
                            const headers = {
                                'Authorization': `Bearer ${config.server.getToken()}`
                            };
                            const custConfig = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getCustomerConfig}`, data, headers);
                            filePtah = custConfig.data.localgraphicfilepath || '';

                        }
                        custom.customFilePath = getFormattedName(filePtah, this.activityDetails.placeHolders);
                        await this.BookDetailsTextForActivites({
                            workOrderId: workOrderId,
                            activityId: activity.id,
                            activityname: activityConfig.displayName,
                            stageId: stage.id,
                            stagename: stage.name,
                            ext: extname(custom.name),
                            graphicspath: custom.customFilePath,
                            type: 'figuretex',
                            woIncomingFileId : this.activityDetails.woIncomingFileId

                        })
                        this.activityDetails.FigureDetails.fileName = custom.name;
                    }
                }
            }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });

    };

    async BookDetailsTextForActivites(Payload) {
        return new Promise(async (resolve, reject) => {
            try {
                if (Payload.type == 'bookdetails') {
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                console.log(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.BookDetailsTextForActivites}`, 'urllll')
                const fileDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.BookDetailsTextForActivites}`, Payload, headers);
                // if (Payload.type == 'bookdetails') {
                    this.activityDetails.BookDetails = { content: fileDetails && fileDetails.data ? fileDetails.data : '' };
                } else {
                    this.activityDetails.FigureDetails = { content: Payload && Payload.graphicspath  ? Payload.graphicspath : '' };
                }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    async fetchPlaceHolders() {
        return new Promise(async (resolve, reject) => {
            try {
                const placeHolderPayload = {
                    wfEventId: this.activityDetails.wfEventId,
                    workOrderId: this.activityDetails.workOrderId,
                    woIncomingFileId : this.activityDetails.woIncomingFileId

                };
                const headers = {
                    'Authorization': `Bearer ${config.server.getToken()}`
                };
                this.activityDetails.placeHolders = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getPlaceHolders}`, placeHolderPayload, headers);
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    async fetchPathDetails() {
        return new Promise(async (resolve, reject) => {
            try {
                const activityEvent = ( this.activityDetails.activitymodeltypeflow === 'Batch' || this.activityDetails.runonfilesequence ) ? this.activityDetails.activity.name : this.activityDetails.wfEventId;

                this.pathDetails.okm.path = this.activityDetails.basePath;
                this.pathDetails.client.id = createHashObject(this.activityDetails.basePath + activityEvent + this.activityDetails.activity.actualactivitycount + this.activityDetails.activity.count);
                this.pathDetails.client.baseDir = getBaseDir(this.activityDetails.du.name.replace(/ /g, "_"));
                global.isInternalConnection = await checkIsInternalConnection("//integrafs3");
                this.pathDetails.client.path = getFormattedClientPath(extendedJoin([this.pathDetails.client.baseDir, this.pathDetails.client.id]));
                this.pathDetails.client.tools = getFormattedClientPath(extendedJoin([this.pathDetails.client.baseDir, '__Tools__', this.pathDetails.client.id]));
                global.log(this.pathDetails.okm.path, 'okm base path');
                global.log(this.pathDetails.client.path, 'client base path');
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    async updateStatusToServer(data, status) {
        if (process.env.ELECTRON_RUNNER == "true") {
            globalSocket.emitEvent(this.sid, 'okmStatus', { data, status });
            return true;
        } else {
            const serverPayload = {
                sid: this.sid,
                data,
                status
            };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            return await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.okm.updateStatus}`, serverPayload, headers);
        }
    }

    async logLocalWorkingFolder(Process = '') {
        try {
            let getAllFiles = (dir) => {
                if (!(typeof dir == 'string')) {
                    dir = dir.name;
                }
                return readdirSync(dir).reduce((files, file) => {
                    if (typeof file == 'string') {
                        file = { name: file }
                    }
                    const name = join(dir, file.name);
                    const isDirectory = statSync(name).isDirectory();
                    let _file = { name: file.name, modifiedTime: statSync(name).mtime }
                    return isDirectory ? [...files, ...getAllFiles(name)] : [...files, _file];
                }, []);
            }
            let listFile = await getAllFiles(this.pathDetails.client.path);
            let Logstring = `${Process}, Created Log of Workingfolder files.`;
            listFile.forEach(element => {
                Logstring = `${Logstring}\n${element.name} : ${element.modifiedTime}`;
            });
            global.log(Logstring);
        } catch (error) {
            global.log("Working folder log error : ", error)
        }
    }

    async processAction(payload) {
        switch (this.type) {
            case "open_files":
                return new OpenFiles(this).startProcess(payload);
            case "open_stylesheet":
                return new openStyleSheet(this).startProcess(payload);
            case "sync_folder":
                return new Sync(this).startProcess(payload);
            case "open_explorer":
                return new OpenExporer(this).startProcess(payload);
            case "clear_activity":
                return new ClearActivity(this).startProcess(payload);
            case "sync_tools_file":
                return new SyncToolsFile(this).startProcess(payload);
            case "client_tool":
                return new ClientTool(this).startProcess(payload);
            case 'download_files':
                return new DownloadFiles(this).startProcess(payload);
            case 'share_filesync':
                return new ShareFilesync(this).startProcess(payload);
            case 'auto_open_files':
                return new AutoOpenFile(this).startProcess(payload);
            case 'download_blob_files':
                return new DownloadBlobFiles(this).startProcess(payload);
            case 'file_backup':
                return new BackupFiles(this).startProcess(payload);
            case 'backup_download':
                return new BackupDownload(this).startProcess(payload);
            case 'acs_contentwrite':
                return new ACSerrorhandle(this).startProcess(payload);
            case 'reject_folder':
                return new Reject(this).startProcess(payload);
            default:
                return Promise.reject(`No Matching type (${this.type}) found`);
        }
    }
}

module.exports = {
    ClientUtility
};
