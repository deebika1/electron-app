const { onsavetoolsValidation } = require('../postProcessing/tools')



const postProcessing = async (filesInfo, clientUtility, payload) => {
    global.log('ON SAVE VALIDATION Started');
    return new Promise(async (resolve, reject) => {
        var onSaveValidationList = []
        try {
            for (let i = 0; i < filesInfo.data.length; i++) {
                if (clientUtility.activityDetails.validationFileConfig[filesInfo.data[i].typeId]) {
                    //let files = clientUtility.activityDetails.validationFileConfig[filesInfo.data[i].typeId].files
                    let on_save_tool_validation = clientUtility.activityDetails.config.onSaveToolsId || [];
                    for (let j = 0; j < on_save_tool_validation.length; j++) {
                        await clientUtility.updateStatusToServer({ message: 'On save tool validation started', progress: 80 }, 2)
                        await onsavetoolsValidation(clientUtility, payload, on_save_tool_validation[j])
                        await clientUtility.updateStatusToServer({ message: 'On save tool validation completed', progress: 98 }, 2)
                    }
                }
            }
            resolve();

        } catch (err) {
            reject(err)
        }
    })
}

module.exports = {
    postProcessing
};