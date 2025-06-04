const electronInstaller = require('electron-winstaller');
const env = require('./src/config/env.json')
const package = require("./package.json");
try {
    let WMSApp = package.name;
    let icon = "./icons/wmsicons.ico"
    electronInstaller.createWindowsInstaller({
        appDirectory: `./Electron-Windows/${WMSApp}-win32-x64`,
        outputDirectory: './windows',
        authors: 'Integra Software Service Pvt. Ltd.',
        description: 'Work flow management system application.',
        version: '1.1.0',
        exe: `${WMSApp}.exe`,
        name: `${WMSApp}`,
        setupMsi: `${WMSApp}.msi`,
        setupExe: `${WMSApp}.exe`,
        loadingGif: './icons/Blocks.gif',
        //iconUrl: "./icons/wmsicons.ico",
        setupIcon: `${icon}`,
        // certificateFile: './assets/server-ca.crt',
        noMsi: false
    });

    console.log('Started To Create Windows msi/exe!');

} catch (e) {

    console.log(`No dice: ${e.message}`);

}