global.dotenv = require("dotenv");
(
    async function () {
        "use strict";
        dotenv.config();
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
        const fs = require("fs");
        const path = require("path");
        let configjson = JSON.parse(fs.readFileSync(path.join(process.env.dir, "config.json")));
        process.env.MODE = configjson.mode;
        process.env.UtilityVersion = configjson.env[configjson.mode].UtilityVersion;
        process.env.AppVersion = configjson.env[configjson.mode].AppVersion;
        process.env.ELECTRON_RUNNER = true;
        const express = require("express");
        const app = express();
        const http = require("http");
        const bodyParser = require("body-parser");
        const cors = require("cors");
        const { bootstrapApp } = require('./src/app');
        const { initializeLogger } = require('./src/modules/utils/log');
        const windowConfig = require('./config/utility/window');
        const { isPathExist } = require('./src/modules/utils/io');
        const yargs = require('yargs');
        const { userInfo, hostname } = require("os");
        const portfinder = require('portfinder');
        const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
        const progress = require('request-progress');
        const request = require('request');
        process.env.SYSTEM_NAME = hostname();
        process.env.USER_NAME = userInfo().username;
        global.globalSocket = require("./localSocket/socketServer");
        //app.set('trust proxy', true);
        const VersionUpdater = () => {
            return new Promise(async (resolve, reject) => {
                try {
                    let config = JSON.parse(fs.readFileSync(path.join(process.env.dir, "config.json")));
                    const env = config.env[config.mode];
                    const checkDirectorySync = (directory) => {
                        try {
                            fs.statSync(directory);
                        } catch (e) {
                            fs.mkdirSync(directory, { recursive: true });
                        }
                    }
                    const unzipFile = (filePath) => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                const path = require("path");
                                // await extract(filePath,{dir: path.join(filePath, '../')});
                                var JSZip = require('JSZip');
                                var _path = path.dirname(filePath);
                                fs.readFile(filePath, function (err, data) {
                                    if (!err) {
                                        var zip = new JSZip();
                                        JSZip.loadAsync(data).then(async function (zip) {
                                            for (let i = 0; i < Object.keys(zip.files).length; i++) {
                                                let filename = Object.keys(zip.files)[i];
                                                let dest = path.join(_path, filename);
                                                checkDirectorySync(path.dirname(dest));
                                                if (path.extname(dest) != '')
                                                    await zip.file(filename).async('nodebuffer').then(function (content) {
                                                        fs.writeFileSync(dest, content);
                                                    }).catch(err => {
                                                        reject(err);
                                                    });
                                            }
                                            resolve(true);
                                        }).catch(err => {
                                            reject(err);
                                        });
                                    }
                                });
                            } catch (error) {
                                reject(error);
                            }
                        });
                    }
                    const CallGetAPI = async function postAPI(url, headers = []) {
                        return new Promise((resolve, reject) => {
                            try {
                                let xhttp = new XMLHttpRequest();
                                xhttp.timeout = 60000
                                xhttp.onreadystatechange = function () {
                                    if (this.readyState == 4 && this.status == 200) {
                                        resolve(JSON.parse(this.responseText));
                                    } else if (this.readyState == 4 && (this.status == 0 || this.status == 400 || this.status == 404 || this.status == 500)) {
                                        reject({
                                            message: this.responseText
                                        });
                                    }
                                };
                                xhttp.open("GET", url, true);
                                xhttp.setRequestHeader("Content-Type", "application/json");
                                headers.forEach(element => {
                                    xhttp.setRequestHeader(Object.keys(element)[0], element[Object.keys(element)[0]]);
                                });
                                xhttp.send();
                            } catch (error) {
                                reject(error);
                            }
                        });
                    }
                    const download = (url, dest, mode = undefined) => {
                        const fileName = path.basename(dest);
                        return new Promise((resolve, reject) => {
                            const writeStream = fs.createWriteStream(dest, { mode });
                            writeStream.on('close', () => {
                                resolve();
                            });
                            progress(request(url))
                                .on('progress', (state) => {
                                    state.fileName = fileName;
                                })
                                .on('error', (err) => {
                                    reject(err);
                                })
                                .on('end', () => {
                                })
                                .pipe(writeStream);
                        });
                    }
                    const downloadFile = (url, dest, name, mode = undefined) => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                await fs.promises.mkdir(dest, { recursive: true });
                                let output = await CallGetAPI(`${config.env[config.mode].azureURL}${config.env[config.mode].azuredownload}?docPath=${url}`,[]);
                                await download(output.path, `${dest}${name}`, mode);
                                resolve(`${dest}${name}`);
                            } catch (e) {
                                if (e?.message?.data) e.message = e.message.data; // for dms error message
                                reject(e);
                            }
                        });
                    }
                    let versionAPIFailed = false;
                    let VersionDetails = await CallGetAPI(env.serverURL + env.VersionCheckURL, [{ 'Authorization': `Bearer ${env.serverToken}` }]).catch(err => {
                        versionAPIFailed = true;
                        fs.writeFileSync("log.txt", err);
                    });
                    if (!versionAPIFailed) {
                        if (VersionDetails.UtilityVersion != env.UtilityVersion) {
                            process.env.needRestart = true;
                            await downloadFile(env.UtilityURL, process.env.dir, "build.zip");
                            await unzipFile(path.join(process.env.dir, "build.zip"));
                            fs.unlinkSync(path.join(process.env.dir, "build.zip"));
                        }
                        if (VersionDetails.AppVersion != env.AppVersion) {
                            process.env.needRestart = true;
                            await downloadFile(env.AppURL, process.env.dir, "build.zip");
                            if (fs.existsSync(path.join(process.env.dir, "build"))) {
                                fs.rmSync(path.join(process.env.dir, "build"), { recursive: true });
                            }
                            await unzipFile(path.join(process.env.dir, "build.zip"));
                            fs.unlinkSync(path.join(process.env.dir, "build.zip"));
                        }
                        let configjson = JSON.parse(fs.readFileSync(path.join(process.env.dir, "config.json")));
                        configjson.env[configjson.mode].UtilityVersion = VersionDetails.UtilityVersion;
                        configjson.env[configjson.mode].AppVersion = VersionDetails.AppVersion;
                        fs.writeFileSync(path.join(process.env.dir, "config.json"), JSON.stringify(configjson, null, 4));
                    }
                    let configjson = JSON.parse(fs.readFileSync(path.join(process.env.dir, "config.json")));
                    process.env.UtilityVersion = configjson.env[configjson.mode].UtilityVersion;
                    process.env.AppVersion = configjson.env[configjson.mode].AppVersion;
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        }
        app.use(
            cors({
              origin: (origin, callback) => {
                return callback(null, true);
              }
            }),
          );
        //app.options('*', cors());
        //app.use(cors());
        //app.disable("x-powered-by");
        app.use(bodyParser.json({
            limit: '500mb'
        }));
        // app.use(bodyParser.text({
        //     limit: '500mb'
        // }));
        app.use(bodyParser.urlencoded({
            limit: '500mb',
            extended: true,
            parameterLimit: 1000000
        }));

        app.use(function (req, res, next) {
            try {
                if (typeof (req.body) == typeof ('string')) {
                    req.body = JSON.parse(req.body);
                }
            } catch (err) { console.log(err); }
            next();
        }
        );
        const router = express.Router();
        const staticRouter = () => {
            if (fs.existsSync(path.join(path.resolve(), 'resources/app/build', 'index.html'))) {
                app.use(express.static(path.join(path.resolve(), 'resources/app/build')));
            } else if (fs.existsSync(path.join(process.env.dir, 'build', 'index.html'))) {
                app.use(express.static(path.join(process.env.dir, 'build')));
            }  else {
                app.use(express.static(path.join(path.resolve(), 'build')));
            }
        }
        staticRouter();
      
 //this is for image upload post method     
        app.use("/", router.post('/iwms', (req, res) => {
            const argv = yargs(process.argv).argv;
            const iwmsArg = req.body.input;
            res.status(200).send("triggered.")
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
        }));

        app.use("/", router.get('/*', (req, res) => {
            if (fs.existsSync(path.join(path.resolve(), 'resources/app/build', 'index.html'))) {
                res.sendFile(path.join(path.resolve(), 'resources/app/build/index.html'));
            } else if (fs.existsSync(path.join(process.env.dir, 'Resources/app/build', 'index.html'))) {
                res.sendFile(path.join(process.env.dir, 'Resources/app/build/index.html'));
            }
            else {
                console.log(path.join(path.resolve(), 'build'))
                res.sendFile(path.join(path.resolve(), 'build/index.html'));
            }
        }));

        const server = http.createServer(app);
        globalSocket.establishSocket(server);
        portfinder.basePort = 8001;
        let port = await portfinder.getPortPromise()
            .catch((err) => {
                console.log("Port Error", err);
            });
        server.listen(port, function () {
            console.log("api listening on port " + port + "!");
        })
        if (process.env.NODE_DEV == "true") {
            global.console = console;
        } else {
            global.console = (function () {
                return {
                    log: function (text) {
                        //Console.log(text);
                        // Your code
                    },
                    info: function (text) {
                        //Console.info(text);
                        // Your code
                    },
                    warn: function (text) {
                        //Console.warn(text);
                        // Your code
                    },
                    error: function (text) {
                        //Console.error(text);
                        // Your code
                    }
                };
            }());
            // await VersionUpdater().catch(err => {
            //     console.log(err);
            // });
        }
        process.env.URL = 'http://localhost:' + port + '/';
        process.env.PORT = port;
    }()
);
