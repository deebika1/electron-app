const { config } = require('./config/index');
const { env } = require('./config/env.json');
const { ClientUtility } = require('./modules/index');

const bootstrapApp = (iwmsArg) => {
    return new Promise(async (resolve, reject) => {
        if ((iwmsArg && iwmsArg.includes(config.customURI.protocol)) || process.env.ELECTRON_RUNNER == "true") {
            if (process.env.ELECTRON_RUNNER != "true") {
                iwmsArg = iwmsArg.split(config.customURI.protocol)[1];
            }
            if (iwmsArg) {
                const decodedIWMSArgs = decodeURIComponent(iwmsArg);
                const components = decodedIWMSArgs.split(config.customURI.delimitter);
                if (components[0] && components[1]) {
                    let header = {};
                    let payload = {};
                    try {
                        header = JSON.parse(components[0]);
                        if (header.mode) {
                            if (env[header.mode]) {
                                global.MODE = header.mode;
                            } else {
                                reject(`ENV configuration not found for the ${env[header.mode]}`);
                            }
                        } else {
                            reject('ENV not found in IWMS header');
                        }
                    } catch (e) {
                        reject('Issue in parsing IWMS header', e);
                    }
                    try {
                        payload = JSON.parse(components[1]);
                    } catch (e) {
                        reject('Issue in parsing IWMS payload', e);
                    }
                    try {
                        global.isInternalConnection = false;
                        await new ClientUtility().process(header, payload);
                        global.log(`${header.type} process completed`);
                        resolve();
                    } catch (e) {
                        global.log(header, 'header');
                        global.log(payload, 'payload');
                        reject(e);
                    }
                } else {
                    reject("IWMS Header / Payload not found");
                }
            } else {
                reject("Custom uri args not found");
            }
        } else {
            reject("Custom uri not found");
        }
    });
};

module.exports = {
    bootstrapApp
};