const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { writeSmallFile, isFileExistOKM, createFileTypeFolderStructure, removeFolder, getFileTypeFolderStructure } = require('../utils/io');
const { post } = require('../http/index');
const { uploadNewFile} = require('../utils/okm')
//const azureHelper = require('../utils/azure')
const {uploadExistingFile} = require('../utils/azure.js')

const getJobInfoDetails = async (clientUtility) => {
    const getJobInforPayload = {
        woId: clientUtility.activityDetails.workOrderId,
        wfEventId: clientUtility.activityDetails.wfEventId,
        sessionId: clientUtility.pathDetails.client.id,
        workingPath: clientUtility.pathDetails.client.path
    }
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    return new Promise(async (resolve, reject) => {
        try {
            if(clientUtility.activityDetails.customer.id == '9'){
                await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getIoppJournalDetails}`, getJobInforPayload, headers).then((data) => {
                    console.log(data, "xml")
                    resolve(data.data)
                })
            } else{
            await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.getJobInfoDetails}`, getJobInforPayload, headers).then((data) => {
                console.log(data, "xml")
                resolve(data.data)
            })
         }
        } catch (error) {
            console.log(error, 'error in getting book details')
            reject(error)
        }
    })
}

const generateJobInfoXml = async (clientUtility, filename, incomingFileDetails) => {
    return new Promise(async (resolve, reject) => {
        await getJobInfoDetails(clientUtility).then(async (data) => {
            try {
                // xml file avaliable under book
                let folderStructurePayload = {}
                folderStructurePayload = {
                    type: clientUtility.activityDetails.allowSubFileType ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                    du: clientUtility.activityDetails.du,
                    customer: clientUtility.activityDetails.customer,
                    workOrderId: clientUtility.activityDetails.workOrderId,
                    service: clientUtility.activityDetails.service,
                    stage: clientUtility.activityDetails.stage,
                    activity: clientUtility.activityDetails.activity,
                    fileType: {
                        name: incomingFileDetails.type,
                        id: incomingFileDetails.typeId,
                        fileId: incomingFileDetails.incomingFileId
                    }
                };
                let foldername, folderuuid;
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
                        let out = await createFileTypeFolderStructure(folderStructurePayload);
                        foldername = out.name;
                        folderuuid = out.uuid;
                        break;
                }
               // if (srcFolderChapter) foldername = foldername + `${incomingFileDetails.incomingFileId}/`
                data = Object.keys(data).length ? data : undefined
                await writeSmallFile(`${clientUtility.pathDetails.client.path}/${filename}`, data, `${clientUtility.pathDetails.client.path}`)
                // resolve();
                await uploadExistingFile(`${clientUtility.pathDetails.client.path}/${filename}`, `${foldername}${filename}` )
                resolve({ path: foldername + filename, uuid: folderuuid  })
            } catch (error) {
                reject(error)
            }
        });
    })
}




module.exports = {
    generateJobInfoXml, uploadNewFile
};