const fs = require("fs");
const path = require("path");
const envr = process.env.NODE_ENV;
let package = JSON.parse(fs.readFileSync("package.json"));
package.name = `wmsapp_${envr}`;
if (envr == "azure") {
    package.name = "wmsapp";
    package["scripts"]["package-mac"] = `electron-packager ./electron/. wmsapp --overwrite=true --platform=darwin --arch=x64 --icon=icons/wmsicons.icns --prune=true --out=Electron-Mac`
    package["scripts"]["package-win"] = `electron-packager ./electron/. wmsapp --overwrite=true --platform=win32 --arch=x64 --icon=icons/wmsicons.ico --prune=true --out=Electron-Windows`
    package["scripts"]["package-linux"] = `electron-packager ./electron/. wmsapp --overwrite=true --platform=win32 --arch=x64 --icon=icons/wmsicons.ico --prune=true --out=Electron-Windows`
}
else {
    package["scripts"]["package-mac"] = `electron-packager ./electron/. wmsapp_${envr} --overwrite=true --platform=darwin --arch=x64 --icon=icons/wmsicons.icns --prune=true --out=Electron-Mac`
    package["scripts"]["package-win"] = `electron-packager ./electron/. wmsapp_${envr} --overwrite=true --platform=win32 --arch=x64 --icon=icons/wmsicons.ico --prune=true --out=Electron-Windows`
    package["scripts"]["package-linux"] = `electron-packager ./electron/. wmsapp_${envr} --overwrite --asar --platform=linux --arch=x64 --icon=icons/wmsicons.ico --prune=true --out=Electron-Linux`
}
fs.writeFileSync(path.join("package.json"), JSON.stringify(package, null, 4));
let configjson = JSON.parse(fs.readFileSync(path.join("./electron/config.json")));
configjson.mode = envr;
fs.writeFileSync(path.join("./electron/config.json"), JSON.stringify(configjson, null, 4));
let env = JSON.parse(fs.readFileSync(path.join("./src/config/env.json")));
env.mode = envr;
fs.writeFileSync(path.join("./src/config/env.json"), JSON.stringify(env, null, 4));

