const log4js = require("log4js");
const { config } = require('./../../config/index');
const { join } = require('path');

const initializeLogger = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fileName = join(path ? path : config.clientUtility.baseFolder || 'C:\\itools\\IClientUtility',  'logs', `iwms-${new Date().toISOString().split('T')[0]}.txt`); // process.env.dir ||
            log4js.configure({
                appenders: { iwms: { type: "dateFile", filename: fileName, keepFileExt: true } },
                categories: { default: { appenders: ["iwms"], level: "debug" } }
            });
            const logger = log4js.getLogger("iwms");
            initialize(logger);
            global.log('Logger Initialized');
            resolve();
        } catch (e) {
            global.log(e, 'initializeLogger error');
            reject(e);
        }
    });
}

const initialize = (logger) => {
    global.log = (...args) => {
        console.log(...args);
        logger.info(...args);
    };
    global.log.error = (...args) => {
        console.error(...args);
        logger.error(...args);
    };
    global.log.warn = (...args) => {
        console.warn(...args);
        logger.warn(...args);
    };
}

module.exports = {
    initializeLogger
};
