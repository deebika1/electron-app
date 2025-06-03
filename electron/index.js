let server = undefined;
process.env.dir = __dirname + "/";
if (process.env.NODE_DEV == "true") {
    server = require('../server');
}
else {
    server = require('./main');
}
const { app, BrowserWindow, dialog, Menu } = require('electron');
global.dialog = dialog;
global.electronApp = app;
// global.edge = require("electron-edge-js");
const fs = require('fs');
const os = require('os');
const ChildProcess = require('child_process');
const path = require('path');
//dotenv.config();
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit();
}
if (os == "darwin") {
    //do nothing
} else {
    if (handleSquirrelEvent(app)) {
        return;
    }
}


function handleSquirrelEvent(application) {
    if (process.argv.length === 1) {
        return false;
    }
    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = process.env.MODE == "azure" ? "wmsapp.exe" : `wmsapp_${process.env.MODE}.exe`;
    const spawn = function (command, args) {
        let spawnedProcess;

        try {
            spawnedProcess = ChildProcess.spawn(command, args, { detached: true });
        } catch (error) {
            fs.writeFileSync("log.txt", error);
        }

        return spawnedProcess;
    };

    const spawnUpdate = function (args) {
        return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case "--squirrel-install":
        case '--squirrel-updated':
            spawnUpdate(['--createShortcut', exeName]);
            setTimeout(application.quit, 1000);
            spawnUpdate(['--shortcut-locations=StartMenu', exeName]);
            setTimeout(application.quit, 1000);
            return true;
        case "--squirrel-obsolete":
            application.quit();
            return true;
        case '--squirrel-uninstall':
            spawnUpdate(['--removeShortcut', exeName]);
            setTimeout(application.quit, 1000);
            return true;
    }
}

const VersionUpdater = () => {
    return new Promise(async (resolve, reject) => {
        try {
            function wait(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
            while (!process.env.URL) {
                await wait(1000);
            }
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function createWindow() {
    let icon = `./icons/wmsicon_${process.env.MODE}.ico`;
    let mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        icon: path.join(process.env.dir, icon),
        webPreferences: {
            nodeIntegration: true,
            // preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            backgroundThrottling: false,
        }
    });
    const template = [
        {
            label: 'Edit',
            submenu: [
                {
                    role: 'undo'
                },
                {
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'cut'
                },
                {
                    role: 'copy'
                },
                {
                    role: 'paste'
                }
            ]
        },

        {
            label: 'View',
            submenu: [
                {
                    role: 'reload'
                },
                {
                    role: 'toggledevtools'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'resetzoom'
                },
                {
                    role: 'zoomin'
                },
                {
                    role: 'zoomout'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'togglefullscreen'
                }
            ]
        },

        {
            role: 'window',
            submenu: [
                {
                    role: 'minimize'
                },
                {
                    role: 'close'
                },
                { type: 'separator' },
                {
                    label: `Client Utility Version : ${process.env.UtilityVersion}`
                },
                {
                    label: `APP Version : ${process.env.AppVersion}`
                },
                {
                    label: `Electron Version : v 15.4 29052025`
                }
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
    await VersionUpdater().catch(err => {
        console.log(err);
    });
    if (process.env.NODE_DEV == "true") {
        mainWindow.webContents.openDevTools()
    }
    // Menu.setApplicationMenu(null);
    // mainWindow.isMenuBarVisible(false);
    mainWindow.loadURL(
         "http://localhost:3000"
        // "http://172.16.200.197:82/login"
           //process.env.URL + "login"
        //'http://localhost:3001/login'
        //'https://iwms.integra.co.in/login'
    );
    //  mainWindow.on("closed", () => (loading = null));
    // Menu.setApplicationMenu(null);
    // mainWindow.excludedFromShownWindowsMenu = true
    mainWindow.webContents.once("dom-ready", async () => {
        await mainWindow.webContents.executeJavaScript(`localStorage.clear()`)
        await mainWindow.webContents.executeJavaScript(`localStorage.setItem('SYSTEM_NAME','${process.env.SYSTEM_NAME}')`)
        await mainWindow.webContents.executeJavaScript(`localStorage.setItem('USER_NAME','${process.env.USER_NAME}')`)
        await mainWindow.webContents.executeJavaScript(`localStorage.setItem('IN_DESKTOP_ENV',true)`)
        await mainWindow.webContents.executeJavaScript(`localStorage.setItem('IN_Electron_ENV',true)`)
        await mainWindow.webContents.executeJavaScript(`localStorage.setItem('api_port','${process.env.PORT}')`)
        await mainWindow.webContents.executeJavaScript(`localStorage.setItem('DIR_ENV','${JSON.stringify(process.env.dir)}')`)
    });
    mainWindow.once('ready-to-show', () => {
        if (process.env.needRestart == "true") {
            process.env.needRestart = "false"
            process.env.skipClosAlert = "true"
            app.relaunch();
            app.quit();
        } else {
            mainWindow.maximize();
            mainWindow.show();
        }
    });
    mainWindow.on('close', async (e) => {
        console.log(mainWindow)
        if (process.env.skipClosAlert != "true") {
            e.preventDefault();
            let isProductionPage = await mainWindow.webContents.executeJavaScript('localStorage.getItem("despatcData");', true);
            if (!(isProductionPage == undefined || isProductionPage == '' || isProductionPage == '{}')) {
                dialog.showErrorBox('Do not close the system while the file is in progress.', 'Please keep the file pending / save / cancel.')
                e.preventDefault();
            } else {
                let response = dialog.showMessageBoxSync(null, {
                    type: "question",
                    message: "Are you sure to close ?",
                    buttons: ["Cancel", "Yes, please", "No, thanks"],
                });
                if (response != 1) e.preventDefault();
                else if (response == 1) {
                    await mainWindow.webContents.executeJavaScript(
                        `localStorage.clear()`
                    );
                    process.env.skipClosAlert = "true"
                    mainWindow.close();
                }
            }
        } else {
            process.env.skipClosAlert = "false"
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    mainWindow.on('window-all-closed', async () => {

        if (process.platform !== 'darwin') {
            mainWindow.quit()
        }
    })
    const { shell } = require('electron');
    mainWindow.webContents.on('new-window', function (e, url) {
        e.preventDefault();
        shell.openExternal(url);
    });
}
app.on('ready', createWindow);

