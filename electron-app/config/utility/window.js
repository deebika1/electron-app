const { execSync } = require('child_process');

const updateEnvironment = (path) => {
    return new Promise((resolve, reject) => {
        try {
            global.log('Updating Environment Variable');
            execSync(`setx IWMS_CLIENT ${path} /m`);
            global.log('Updated Environment Variable');
            resolve();
        } catch (err) {
            global.log(err, 'updateRegistry');
            reject(err);
        }
    });
}

const updateRegistry = () => {
    return new Promise((resolve, reject) => {
        try {
            global.log('Updating Client Registry Key');
            execSync(`reg add "HKCR\\iwms" /v "URL Protocol" /t REG_SZ /d "" /f`);
            execSync(`reg add "HKCR\\iwms\\shell\\open\\command" /ve /t REG_EXPAND_SZ /d """"^%IWMS_CLIENT^%\\iwms-client-util-win.exe""" %1" /f`);
            global.log('Updated Client Registry Key');
            global.log('Updating Browser Policy');
            execSync(`reg add "HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\URLAllowlist" /v "1" /t REG_SZ /d "iwms:*" /f`);
            global.log('Updated Browser Policy');
            resolve();
        } catch (err) {
            global.log(err, 'updateRegistry');
            reject(err);
        }
    });
}

const register = (path) => {
    return new Promise(async (resolve, reject) => {
        try {
            await updateEnvironment(path);
            await updateRegistry();
            resolve();
        } catch (err) {
            global.log(err, 'register');
            reject(err);
        }
    })
};

module.exports = {
    register
}