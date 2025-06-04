const { Logger } = require('log4js');
const { APIConfig } = require('../../config/api');
const { config } = require('../../config/index');
const { post } = require('../../modules/http/index');





const getToolDetails = (clientUtility, toolId) => {
    global.log(`On Save getToolDetails ${toolId} process started ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
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
            global.log(`On Save getToolDetails ${toolId} process failed ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
            reject(e);
        }
    });
}

const invokeTools = (toolsresponse, clientUtility, payload) => {
    return new Promise(async (resolve, reject) => {
        try {
            let userId= payload.userId?payload.userId:payload.userid//this added becoz from sync we get 2 diffrent params
            if (toolsresponse.id == '279' || toolsresponse.id == '280') {
                var flag = true
                var iAuthors = await fetchguId(clientUtility)
                 console.log(iAuthors,"HIMS")
            }
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
                userId: userId,
                placeHolders: clientUtility.activityDetails.placeHolders,
                workorderDetails,
                workorderId: clientUtility.activityDetails.workOrderId,
                jobId: clientUtility.activityDetails.itemCode,
                stageName: clientUtility.activityDetails.stage.name,
                activityName : clientUtility.activityDetails.activity.name,
                toolsCustom:{},
                sId: clientUtility.sid,
                customerId: clientUtility.activityDetails.customer.id,
                custName: clientUtility.activityDetails.customer.name,
                customerName : clientUtility.activityDetails.customer.name,
                woIncomingFileId : clientUtility.activityDetails.woincomingfileid ||clientUtility.activityDetails.woIncomingFileId,
                iAuthor: flag ? {
                    jobid: iAuthors.guid,
                    activityid: iAuthors.iAuth.activityid,
                    roleid: iAuthors.iAuth.roleid,
                    username: payload.userId,
                    email: payload.userId + "@integra.co.in"
                } : {},
                dmsType : clientUtility.activityDetails.dmsType || "openkm",
                isUICall : true,
                onSave:true,
                activityId : clientUtility.activityDetails.activity.id,
                wfDefid : clientUtility.activityDetails.wfDefId,
                actualActivityCount :clientUtility.activityDetails.activity.actualactivitycount ,
                pdfMerging: "",
                instanceType:  clientUtility.activityDetails.woIncomingFileId ? 'Single' : 'Batch',
                JournalAcronym: clientUtility.activityDetails.itemCode,
                isOtherArticle : clientUtility.activityDetails.isOtherArticle,
                artilceOrderSequence : clientUtility.activityDetails.artilceOrderSequence,
                iscamundaflow: clientUtility.activityDetails.iscamundaflow

               };
            const headers = {
                'Authorization': `Bearer ${config.server.getToken()}`
            };
            const toolDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.invokeTools}`, invokeDetailspayload, headers);
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

const fetchguId = (clientUtility) => {
    return new Promise(async (resolve, reject) => {
      try {
          const payload = {
              workorderId: clientUtility.activityDetails.workOrderId,
              stageId:clientUtility.activityDetails.stage.id ,
              stageIterationCount: clientUtility.activityDetails.stage.iteration,
              activityId:clientUtility.activityDetails.activity.id,
              customerId:clientUtility.activityDetails.customer.id,
          };
          const headers = {
              'Authorization': `Bearer ${config.server.getToken()}`
          };
          const iAuthorDetails = await post(`${APIConfig.server.getBaseURL()}${APIConfig.server.utils.fetchguId}`, payload, headers);
          global.log(iAuthorDetails, 'get Tool Details');
          resolve(iAuthorDetails);

      }
      catch (e) {
          global.log(e, 'iAuthorDetails error');
          reject(e);
      }
  });
}
const onServiceTools = async (clientUtility, payload, toolId,internalTool= false) => {
    global.log(toolId,"ONN");
     return new Promise(async (resolve, reject) => {
        try {
            
            var invokePayload = payload.invokePayload
            if (invokePayload == undefined)
            invokePayload = await getToolDetails(clientUtility, toolId);
            var toolsResponse2 = await invokeTools(invokePayload, clientUtility, payload)
            if(invokePayload){
                var toolsResponse=toolsResponse2
                console.log(toolsResponse,"EE")
                if(toolsResponse2.data.is_success){
                    resolve(toolsResponse2)
                    global.log(`On Save validation success toolid ${toolId} : ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
                }
                else{ 
                    global.log(`On Save validation Failure toolid ${toolId} : ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
                    if(internalTool){
                        resolve(toolsResponse2)
                    }else{
                        throw toolsResponse2.data.message ? toolsResponse2.data.message  : toolsResponse2.data.data    
                    }
                }
            }
           
        } catch (err) {
            global.log(`On Save validation Failure : ${err} toolid ${toolId} : ${clientUtility?.activityDetails?.workOrderId}-${clientUtility?.activityDetails?.itemCode}-${clientUtility.activityDetails.activity.name}`);
            if(internalTool){
                resolve(err) 
            }else{
                if(err)
                 reject(err)
         }
        }
    })
}

module.exports = {
    onServiceTools,
    getToolDetails
};