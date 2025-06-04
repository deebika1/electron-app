const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { createFileTypeFolderStructure, getFormattedName, extendedJoin, getFileTypeFolderStructure } = require('../utils/io');
const { post } = require('../http/index');
const { basename } = require('path');


const getSrcFileDetails = async (workOrderId) => {
    const getTemplateSrcPayload = {
        woId: workOrderId
    }
    const headers = {
        'Authorization': `Bearer ${config.server.getToken()}`
    };
    return new Promise(async (resolve, reject) => {
        try {
            await post(`${APIConfig.server.getBaseURL()}${APIConfig.uri.getTemplateSrcDetails}`, getTemplateSrcPayload, headers).then((data) => {
                var data = data.data
                resolve(data)
            })
        } catch (error) {
            console.log(error, 'error in getting template uploader details')
            reject(error)
        }
    })
}

const getTargetFileTemplateDetails = async (fileMovementDetails, clientUtility) => {
    return new Promise(async (resolve,reject) => {
        try {
            const folderStructurePayload = {
                type: fileMovementDetails.destallowsubfiletype ? 'wo_activity_file_subtype' : 'wo_activity_filetype',
                du: clientUtility.activityDetails.du,
                customer: clientUtility.activityDetails.customer,
                workOrderId: clientUtility.activityDetails.workOrderId,
                service: clientUtility.activityDetails.service,
                stage: clientUtility.activityDetails.stage,
                activity: clientUtility.activityDetails.activity,
                fileType: {
                    name: fileMovementDetails.destfiletype,
                    id: fileMovementDetails.destfiletypeid,
                    fileId: clientUtility.activityDetails.fileType.fileId
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
            resolve({ foldername: foldername, folderuuid: folderuuid })
        } catch (e) {
            console.log('target error',e)
            reject(e)
        }
    })
}


const updateLatestTemplateFileForWoid = async (fileMovementDetails, clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            var srcTemplateDetails = await getSrcFileDetails(clientUtility.activityDetails.workOrderId)
            console.log(srcTemplateDetails, "srcTemplateDetails");
            var targetTemplateDetails = await getTargetFileTemplateDetails(fileMovementDetails, clientUtility);

            //     if(srcTemplateDetails.length >0 && srcTemplateDetails[0].type == 'update'){
            //     var targetTemplateDetails = await getTargetFileTemplateDetails(fileMovementDetails,clientUtility);

            //     let filename = getFormattedName(fileMovementDetails.destination,clientUtility.activityDetails.placeHolders)
            //     const fileExistDetails = await isFileExistOKM(targetTemplateDetails.foldername + filename)
            //     console.log("fileExistDetails", fileExistDetails);
            //     const copyFilePayload = {
            //         src: srcTemplateDetails[0].templateuuid,
            //         name: filename,
            //         dest: targetTemplateDetails.folderuuid,
            //         destBasePath: targetTemplateDetails.foldername
            //     };
            //     if(!fileExistDetails.isExist){
            //         const { path, uuid }=await copyTemplateFile(copyFilePayload)
            //         srcTemplateDetails[0].path = path;
            //         srcTemplateDetails[0].uuid = uuid;
            //     }else{
            //         await deleteFile(targetTemplateDetails.foldername + filename)
            //         const { path, uuid }=await copyTemplateFile(copyFilePayload)
            //         srcTemplateDetails[0].path = path;
            //         srcTemplateDetails[0].uuid = uuid;
            //     }
            // }
            //resolve(srcTemplateDetails);
            if (srcTemplateDetails.length > 0) {
                let isFolder = targetTemplateDetails.foldername.replace(clientUtility.activityDetails.basePath, "");
                isFolder = isFolder && isFolder.length > 0 ? true : false
                let destBasePath =clientUtility.activityDetails.woType == 'Journal' ?  extendedJoin([clientUtility.pathDetails.client.path, '/']) :  isFolder && basename(targetTemplateDetails.foldername) != 'book_1' ? extendedJoin([clientUtility.pathDetails.client.path, basename(targetTemplateDetails.foldername), '/']) : extendedJoin([clientUtility.pathDetails.client.path, '/']);
                let name = getFormattedName(fileMovementDetails.destination, clientUtility.activityDetails.placeHolders)
                let srcPath = srcTemplateDetails[0].templatefilepath + srcTemplateDetails[0].templatename
                resolve([{ src: srcTemplateDetails[0].templateuuid, srcPath: srcPath, destBasePath: destBasePath, name, dest: targetTemplateDetails.folderuuid }])
 
            }else{
                resolve([])
            }
        } catch (error) {
            reject(error)
        }
    });
}




module.exports = {
    updateLatestTemplateFileForWoid
};