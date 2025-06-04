const { bootstrapApp } = require('./src/app');
const { initializeLogger } = require('./src/modules/utils/log');
const windowConfig = require('./config/utility/window');
const { isPathExist } = require('./src/modules/utils/io');
const iwmsArg = process.argv[2];
const yargs = require('yargs');
const argv = yargs(process.argv).argv;
const { userInfo } = require("os");

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
const {resolve} = require('path');
process.env.Base_path = resolve();

if (!argv.path || (argv.path && isPathExist(argv.path))) {
    initializeLogger(argv.path).then(async () => {
        global.log(userInfo().username, 'UserName');
        if (argv.config && argv.path) {
            global.log('Registering Client Util');
            await windowConfig.register(argv.path);
        } else {
            await bootstrapApp(iwmsArg);
            global.log('Process completed');
        }
    }).catch(e => {
        global.log(e, 'initializeLogger');
    });
} else {
    console.log('Path not found', argv.path);
}
