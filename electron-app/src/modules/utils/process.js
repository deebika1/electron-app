const find = require('find-process');
const { spawn, exec } = require('child_process');
const { isPathExist, readDir, readdirSync, getFormattedName, statSync, extendedJoin,readSmallFile, isDirExist } = require('./../utils/io');
const { extname, join, basename } = require('path');
const fs = require('fs');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);

const isRunning = (query) => {
    return new Promise((resolve) => {
        let platform = process.platform;
        let cmd = '';
        switch (platform) {
            case 'win32': cmd = `tasklist /v | find "${query}"`; break;
            case 'darwin': cmd = `ps -ax | grep ${query}`; break;
            case 'linux': cmd = `ps -A`; break;
            default: break;
        }
        exec(cmd, (err, stdout, stderr) => {
            resolve(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
        });
    })
}

const execute = (path, params = []) => {
    params = params instanceof Array ? params : [params];
    return new Promise(async (resolve, reject) => {
        try {
            let successMsg = '';
            let errorMsg = '';
            await execFile(path, params, {
                windowsHide: true
            }).then(data => {
                successMsg = data.stdout;
                global.log(successMsg.trim(), 'spawn success');
                resolve({ isSuccess: true, Message: successMsg })
            }).catch(data => {
                errorMsg = data.stderr.trim();
                global.log(errorMsg.trim(), 'spawn failure');
                resolve({ isSuccess: false, Message: errorMsg.trim() })
            });
        } catch (error) {
            reject(error)
        }
    });
    // return new Promise(async (resolve, reject) => {
    //     try {
    //         let successMsg = '';
    //         let errorMsg = '';
    //         let inMsg = '';
    //         let outMsg = '';
    //         const process = spawn(path, params, {windowsHide:false});
    //         process.stdout.setEncoding('utf8');
    //         process.stderr.setEncoding('utf8');
    //         process.stdin.setEncoding('utf8');
    //         process.stdout.on('data', function (data) {
    //             successMsg += (successMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
    //             global.log(data.toString().trim(), 'spawn success');
    //         });
    //         process.stderr.on('data', function (data) {
    //             errorMsg += (errorMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
    //             global.log(data.toString().trim(), 'spawn failure');
    //         });

    //         process.stdin.on('data', function (data) {
    //             inMsg += (inMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
    //             global.log(data.toString().trim(), 'spawn inMsg re');
    //         });

    //         process.stdout.on('data', function (data) {
    //             outMsg += (outMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
    //             global.log(data.toString().trim(), 'spawn outMsg re');
    //         });
    //         process.on('close', function (code) {
    //             if (errorMsg) {
    //                 resolve({ isSuccess: false, Message: errorMsg })
    //             } else {
    //                 resolve({ isSuccess: true, Message: successMsg })
    //             }
    //         })

    //         process.on('error', (err) => {
    //             reject(err);
    //         });
    //     } catch (err) {
    //         reject(err)
    //     }
    // });
}
// const execute = (path, params = []) => {
//     params = params instanceof Array ? params : [params];

//     return new Promise(async (resolve, reject) => {
//         try {
//             let successMsg = '';
//             let errorMsg = '';
//             let inMsg = '';
//             let outMsg = '';
//             const process = spawn(path, params);
//             process.stdout.setEncoding('utf8');
//             process.stderr.setEncoding('utf8');
//             process.stdin.setEncoding('utf8');
//             process.stdout.on('data', function (data) {
//                 successMsg += (successMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
//                 global.log(data.toString().trim(), 'spawn success');
//             });
//             process.stderr.on('data', function (data) {
//                 errorMsg += (errorMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
//                 global.log(data.toString().trim(), 'spawn failure');
//             });

//             process.stdin.on('data', function (data) {
//                 inMsg += (inMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
//                 global.log(data.toString().trim(), 'spawn inMsg re');
//             });

//             process.stdout.on('data', function (data) {
//                 outMsg += (outMsg ? ('\n' + data.toString().trim()) : data.toString().trim());
//                 global.log(data.toString().trim(), 'spawn outMsg re');
//             });
//             process.on('close', function (code) {
//                 // if (errorMsg && !(outMsg.includes('Process Completed')) || (errorMsg && !(successMsg.includes('Process Completed')))) {
//                 //     // reject(errorMsg);
//                 //     reject('Process Failed');
//                 // } 
//                 // else if (!(outMsg.includes('Process Completed')) || (!(successMsg.includes('Process Completed')))) {
//                 //     // reject(errorMsg);
//                 //     reject('Process Failed');
//                 // }else {
//                 //     resolve(successMsg);
//                 // }
//                 if (errorMsg) {
//                     reject(errorMsg);
//                 } else {
//                     resolve(successMsg);
//                 }
//             });
//             process.on('error', (err) => {
//                 reject(err);
//             });
//         } catch (err) {
//             reject(err)
//         }
//     });
// }

const getFileOutputValidation = () => {
    return new Promise(async (resolve, reject) => {
        try {
            fileavaliable = false;
            lastIteration = 0;
            count = 0;
            finalJ = [];
            validFile = false;
            firstCount = 0;
            outputValidation = [];
            var subFolderName = dirPaths[i]
            var subDirPaths = await readDir(subFolderPath);
            for (let i = 0; i < subDirPaths.length; i++) {
                //  var mainFolder =  extendedJoin([subFolderName, '/']) + subDirPaths[i];
                var mainFolder = subFolderName + '/' + subDirPaths[i]
                compath = extendedJoin([subFolderPath, '/']) + subDirPaths[i];
                lastIteration += 1;
                initalFirstCount = 0;
                var patternList = [];
                for (let j = 0; j < tools.config.files.outputFileValidation.length; j++) {
                    outputValidation = tools.config.files.outputFileValidation[j].typeId
                    if (isPathExist(compath)) {
                        for (let k = 0; k < tools.config.files.outputFileValidation[j].typeId.length; k++) {
                            if (tools.config.files.outputFileValidation[j].name.includes(';FileTypeName;')) {
                                var name = await getFileTypeNames(tools.config.files.outputFileValidation[j].typeId[k].id, tools.config.files.outputFileValidation[j].name, fileTypes, fileTypeDetails);
                                global.log(name, "on save validation file");
                                if (name && Object.keys(name).length > 0) {
                                    clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, FileTypeName: name.FileTypeName }
                                    var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(tools.config.files.outputFileValidation[j].name, clientUtility.activityDetails.placeHolders);
                                }
                            }
                            else if ('isPattern' in tools.config.files.outputFileValidation[j] && tools.config.files.outputFileValidation[j].isPattern) {
                                let regExp = '[a-zA-Z0-9]+'
                                let name = tools.config.files.outputFileValidation[j].name;
                                if (name.includes('*')) {
                                    var formattedFileName = name.replace('*', regExp);
                                    formattedFileName = formattedFileName.replace("/", "\\/")
                                    var regex = new RegExp(formattedFileName, "g")
                                    var patternedName = regex.test(mainFolder)
                                    console.log(patternedName, "patternedName")
                                    var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(formattedFileName, clientUtility.activityDetails.placeHolders);
                                    patternList.push(patternedName)
                                }

                            }
                            else {
                                var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(tools.config.files.outputFileValidation[j].name, clientUtility.activityDetails.placeHolders);
                            }
                            global.log(fileName, mainFolder, "inside sub folder")
                            if (tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && mainFolder.includes(fileName)) {
                                fileavaliable = true;
                                count += 1;
                                global.log('file is  present in lwf folder for on save', successMsg)
                                resolve(successMsg);

                            } else if (tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length == 0) {
                                fileavaliable = true;
                            }

                        }
                        console.log(count, tools.config.files.outputFileValidation[j].typeId.length, "on save validation console for inside lwf folder")
                        var arrLen = tools.config.files.outputFileValidation[j].typeId.filter((list) => list.isRequired);

                        if (fileavaliable && count == arrLen.length && tools.config.files.outputFileValidation[j].type == 'Single') {
                            resolve(successMsg);
                            validFile = true;
                            finalJ = arrLen
                            break;
                        }
                        else if (fileavaliable && count >= 1 && tools.config.files.outputFileValidation[j].type == 'Multiple') {
                            resolve(successMsg);
                            validFile = true;
                            global.log('file is  present in lwf folder for on save', successMsg)
                            finalJ = arrLen
                            break;
                        }
                        else if (lastIteration == subDirPaths.length && count != arrLen.length) {
                            global.log('file is not present in lwf folder for on save', errorMsg)
                            reject(errorMsg);
                            validFile = true;
                            break;
                        }


                    }
                    else {
                        firstCount += 1;
                    }
                }
                var filteredPatternList = patternList.filter((list) => list)
                if (fileavaliable && count == finalJ.length) {
                    resolve(successMsg);
                    break;
                }
                if (filteredPatternList.length > 0) {
                    global.log('file is  present in lwf folder for on save', successMsg)
                    resolve(successMsg);
                }
                if (validFile == false && fileavaliable && lastIteration == subDirPaths.length) {
                    resolve(successMsg);
                    global.log('file is  present in lwf folder for on save', successMsg)
                } else if (firstCount == outputValidation.length) {
                    global.log('file is  present in lwf folder for on save', successMsg)
                    resolve(successMsg);
                }
            }

        } catch (e) {
            console.log("output file validation error")
            reject(e);
        }
    })
}
const executeOutputFileValidation = (tools, clientUtility, fileTypes, successMsg, errorMsg, fileTypeDetails) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (tools.toolTypeId == '2' && tools.toolOutputId == '1') {
                var result = await getOutputFileValidationForFile(tools, clientUtility, fileTypes, successMsg, fileTypeDetails);
                resolve(result)
            } else if (tools.toolTypeId == '2' && tools.toolOutputId == '3') {
                var result =await getOutputFileValidationForText(tools, successMsg, errorMsg);
                resolve(result)
            } else {
                if (errorMsg) {
                    reject(errorMsg);
                } else {
                    resolve(successMsg);
                }
            }
        } catch (e) {
            console.log("output file validation error")
            reject(e);
        }
    })
}

function GetAllFiles(Dir) {
    return new Promise((resolve, reject) => {
        let Files = [];
        let ThroughDirectory = (Directory) => {
            readdirSync(Directory).forEach(File => {
                const Absolute = join(Directory, File);
                if (statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute);
                else return Files.push(Absolute);
            });
        }
        ThroughDirectory(Dir);
        resolve(Files);
    });
}

function GetValidationFileCount(validateFile) {
    return new Promise((resolve, reject) => {
        let sum = 0;
        validateFile.forEach((list) => {
            sum += list.typeId.length
        })
        resolve(sum);
    });
}
const getOutputFileValidationForFile = (tools, clientUtility, fileTypes, successMsg, fileTypeDetails) => {
    return new Promise(async (resolve, reject) => {
        try {
            // var errorMsg = 'Please Check Input Files. So Output file is not generated for further assistance please contact IWMS team'
           var  errorMsg = `${tools.toolName} Validation failed. Please check the "toolError.txt" file for detailed error information.`;
            var fileavaliable = false;
            var lastIteration = 0;
            var count = 0;
            var finalJ = [];
            var validFile = false;
            let firstCount = 0;
            let outputValidation = [];
            var filterArray;
            var lwfpath = clientUtility.pathDetails.client.path;
            if (tools.config.files && tools.config.files.filter(x => x.fileFlowType.includes('OUT')) && tools.config.files.filter(x => x.fileFlowType.includes('OUT')).length > 0) {
                filterArray = [];
                tools.config.files.outputFileValidation = tools.config.files.filter(x => x.fileFlowType.includes('OUT'))
                for (let j = 0; j < tools.config.files.outputFileValidation.length; j++) {
                    filterArray = [];
                    for (let l = 0; l < fileTypeDetails.length; l++) {
                        var a = tools.config.files.outputFileValidation.filter((list) => list.fileTypes.includes(parseInt(fileTypeDetails[l].filetypeid))).map(x => x.fileTypes);
                        if (a.length > 0) filterArray.push(...a);
                    }
                    var originalArray = [...new Set(filterArray)]
                    tools.config.files.outputFileValidation[j].typeId = originalArray
                }
                if (isPathExist(lwfpath)) {
                    var commonFile = await GetAllFiles(lwfpath)
                    var overAllFilteredArray = await GetValidationFileCount(tools.config.files.outputFileValidation)
                    if(clientUtility.activityDetails.iscamundaflow){
                    for (let i = 0; i < commonFile.length; i++) {
                        let compath = commonFile[i]
                        lastIteration += 1;
                        initalFirstCount = 0;
                        var patternList = []
                        for (let j = 0; j < tools.config.files.outputFileValidation.length; j++) {
                            outputValidation = tools.config.files.outputFileValidation[j].fileTypes
                            if (isPathExist(compath)) {
                                for (let k = 0; k < tools.config.files.outputFileValidation[j].typeId.length; k++) {
                                    if (tools.config.files.outputFileValidation[j].name.includes(';FileTypeName;') && !('isPattern' in tools.config.files.outputFileValidation[j])) {
                                        var name = await getFileTypeNames(tools.config.files.outputFileValidation[j].typeId[k], tools.config.files.outputFileValidation[j].name, fileTypes, fileTypeDetails,clientUtility);
                                        console.log(name, "name");
                                        if (name && Object.keys(name).length > 0) {
                                            // var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(tools.config.files.outputFileValidation[j].name, name);
                                            clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, FileTypeName: name.FileTypeName }
                                            var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(tools.config.files.outputFileValidation[j].name, clientUtility.activityDetails.placeHolders);
                                        }
                                    }
                                    else if ('isPattern' in tools.config.files.outputFileValidation[j] && tools.config.files.outputFileValidation[j].isPattern) {
                                        let regExp = '[a-zA-Z0-9\\-\\_]+';
                                        let name = tools.config.files.outputFileValidation[j].name;
                                        if (name.includes('*')) {
                                            var formattedFileName = name.replace('*', regExp);
                                            if (formattedFileName.includes(';FileTypeName;') || formattedFileName.includes(';PageRange;')) {
                                                var name1 = await getFileTypeNames(tools.config.files.outputFileValidation[j].typeId[k].id, tools.config.files.outputFileValidation[j].name, fileTypes, fileTypeDetails,clientUtility);
                                                console.log(name1, "name1");
                                                if (name1 && Object.keys(name1).length > 0) {
                                                    clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, FileTypeName: name1.FileTypeName }
                                                    formattedFileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(formattedFileName, clientUtility.activityDetails.placeHolders);
                                                }
                                            } else {
                                                formattedFileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(formattedFileName, clientUtility.activityDetails.placeHolders);
                                            }
                                            formattedFileName = formattedFileName.replace("/", "\\\\")
                                            var regex = new RegExp(formattedFileName, "g")
                                            var patternedName = regex.test(compath)
                                            count = patternedName ? count + 1 : count
                                            console.log(patternedName, "patternedName")
                                            var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(formattedFileName, clientUtility.activityDetails.placeHolders);
                                            patternList.push(patternedName)

                                        }
                                    }
                                    else {
                                        var springerZipFileName;
                                        for (let i = 0; i < fileTypes.data.length; i++) {
                                            const { files } = fileTypes.data[i];
                                            springerZipFileName = files.length > 0 ? files[0].newfilename : "";
                                        }
                                        clientUtility.activityDetails.placeHolders = { ...clientUtility.activityDetails.placeHolders, zipFileName: springerZipFileName }
                                        var fileName = tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && getFormattedName(tools.config.files.outputFileValidation[j].name, clientUtility.activityDetails.placeHolders);
                                    }
                                    console.log(fileName, commonFile[i], "okkd")
                                    if (clientUtility.activityDetails.customer && clientUtility.activityDetails.customer.id == '13' && tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && (compath == join(clientUtility.pathDetails.client.path, fileName))) {
                                        fileavaliable = true;
                                        count += 1;
                                        resolve(successMsg);
                                    }
                                   
                                    else if (clientUtility.activityDetails.customer && clientUtility.activityDetails.customer.id != '13' &&tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length > 0 && (commonFile[i].includes(fileName) || compath == join(clientUtility.pathDetails.client.path, fileName))) {
                                        fileavaliable = true;
                                        count += 1;
                                        resolve(successMsg);

                                    } else if (tools.config && tools.config.files && tools.config.files.outputFileValidation && tools.config.files.outputFileValidation.length == 0) {
                                        fileavaliable = true;
                                    }

                                }
                                console.log(count, tools.config.files.outputFileValidation[j].typeId.length, "outside folder structure")
                                var arrLen = tools.config.files.outputFileValidation[j].typeId
                                console.log(patternList, "patternList")
                                var filteredPatternList = patternList.filter((list) => list)
                                if (fileavaliable && count == arrLen.length && tools.config.files.outputFileValidation[j].type == 'Single') {
                                    resolve(successMsg);
                                    validFile = true;
                                    finalJ = arrLen
                                    break;
                                }
                                else if (fileavaliable && count >= 1 && tools.config.files.outputFileValidation[j].type == 'Multiple') {
                                    global.log('file is  present in lwf folder for on save', successMsg)
                                    resolve(successMsg);
                                    validFile = true;
                                    finalJ = arrLen
                                    break;
                                }
                                else if (lastIteration == commonFile.length && count != overAllFilteredArray) {
                                    global.log('file is not present in lwf folder for on save', errorMsg)
                                    reject(errorMsg);
                                    validFile = true;
                                    break;
                                }

                            }
                            else {
                                firstCount += 1;
                            }
                        }

                       
                        if (fileavaliable && count == finalJ.length) {
                            break;
                        }
                        if (filteredPatternList.length > 0) {
                            global.log('file is  present in lwf folder for on save', successMsg)
                            resolve(successMsg);
                            break;
                        }
                        if (validFile == false && fileavaliable && lastIteration == commonFile.length) {
                            global.log('file is  present in lwf folder for on save', successMsg)
                            resolve(successMsg);
                        } else if (firstCount == outputValidation.length) {
                            global.log('file is  present in lwf folder for on save', successMsg)
                            resolve(successMsg);
                        }


                    }
                }else{
                    if(clientUtility.activityDetails.customer && clientUtility.activityDetails.customer.id == '14'){
                        const commonFiles = await GetAllFiles(lwfpath);
                        var missedFile = [];
                        if(tools.config.isNewZip){
                            let fileName = tools.config.files.outputFileValidation.map(a=> a.newZipName)
                            let newFileName= getFormattedName(fileName[0], clientUtility.activityDetails.placeHolders);
                            if(fs.existsSync(join(lwfpath,newFileName))) {
                            let newZipname = await readSmallFile(join(lwfpath,newFileName));
                            if (newZipname.includes('PDF_Name') || newZipname.includes('Package Name')) {
                                let tempData = newZipname.split('=')
                                var newFile = ''
                                if (tempData && tempData[0] == 'Package Name') {
                                    newFile = newZipname.replace('Package Name=', "")
                                    newFile = newFile.replaceAll("\'", "")
                                    newFile = basename(newFile)
                                    var ext = extname(newFile)
                                    newFile = newFile.replace(ext, "")
                                } else {
                                    newFile = tempData[1].split('"')[1]
                                }
                            
                            clientUtility.activityDetails.placeHolders= { ...clientUtility.activityDetails.placeHolders, ManuscriptZipName: newFile }
                            }
                        }else{
                            reject(`Mandatory output file missing  ${newFileName}`);
                        }
                        }
                        
                        tools.config.files.outputFileValidation.forEach(file => {
                            const desFile = getFormattedName(file.name, clientUtility.activityDetails.placeHolders);
                            const fileName = join(lwfpath , desFile).replace(new RegExp(/\\/, 'g'), '/');
                               let isFileAvail= fs.existsSync(fileName)

                            // const isFilePresent = commonFiles.some(tempfile => tempfile.replace(new RegExp(/\\/, 'g'), '/') === fileName);
                            if (!isFileAvail  && !file.skipFileConfig) {
                                file.name = desFile;
                                missedFile.push(file);
                            }
                        });
                    }
                    if(missedFile.length >0){
                        reject(errorMsg);
                    }else{
                        resolve(successMsg);
                    }
                }

                }
            } else {
                global.log('on save validation completed')
                resolve('Process completed')
            }
        }
        catch (e) {
            global.log(e, 'get output validation for file error');
            reject(e);
        }
    });
}



const getOutputFileValidationForText = (tools, successMsg, errorMsg) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(tools.config.files, "dfosdk")
            if (tools.config.files && tools.config.files.outputTextValidation && Object.keys(tools.config.files.outputTextValidation).length > 0) {
                if (successMsg == tools.config.files.outputTextValidation.message) {
                    resolve(successMsg)
                } else {
                    if (errorMsg) {
                        reject(errorMsg)
                    } else {
                        reject(successMsg)
                    }

                }
            } else {
                if (successMsg) {
                    resolve();
                } else {
                    reject(errorMsg)
                }
            }

        }
        catch (e) {
            global.log(e, 'get output validation for text file error');
            reject(e);
        }
    })
}

const getFileTypeNames = async (typeId, name, fileTypes, fileTypeDetails,clientUtility) => {
    return new Promise(async (resolve, reject) => {
        try {
            typeId = typeId instanceof Array ? typeId : [typeId];
            var extName = extname(name);
            const fileTypeDetail = fileTypes.data.filter(ft => typeId.includes(parseInt(ft.typeId)));
            const finalFileTypeDetails = fileTypeDetail.length > 0 && fileTypeDetail[0].files && fileTypeDetail[0].files.length > 0 && fileTypeDetail[0].files.filter(file => file.ext == extName);
            if (finalFileTypeDetails.length > 0 && !name.includes('PageRange')) {
                resolve({ FileTypeName: finalFileTypeDetails[0].filename ? finalFileTypeDetails[0].filename : finalFileTypeDetails[0].newfilename })
            } else if (fileTypeDetail.length > 0 && name.includes('PageRange')) {
                resolve({ PageRange: fileTypeDetail[0].pageRange ? fileTypeDetail[0].pageRange : fileTypeDetail[0].filename })
            }
            else if (fileTypeDetail.length > 0 && name.includes('FileTypeName') && (clientUtility && Object.keys(clientUtility).includes('activityDetails') && clientUtility.activityDetails && (Object.keys(clientUtility.activityDetails).includes('isOtherArticle') && clientUtility.activityDetails.isOtherArticle) || fileTypeDetail[0].name != null)) {
                resolve({ FileTypeName: fileTypeDetail[0].name ? fileTypeDetail[0].name : null })
            }
            else if (fileTypeDetails.length > 0) {
                const fileTypeDetail2 = fileTypeDetails.filter(ft => typeId.includes(parseInt(ft.filetypeid)));
                resolve({ FileTypeName: fileTypeDetail2.length > 0 ? fileTypeDetail2[0].filename : null })
            }
            else {
                resolve()
            }


        } catch (e) {
            global.log(e, 'getProcessCount error');
            reject(e);
        }
    });
}

const getProcessList = (appNames) => {
    return new Promise(async (resolve, reject) => {
        try {
            const pList = await find('name', '', true);
            const processList = pList.filter((process) => appNames.includes(process.name)).map((process) => {
                return { name: process.name, pid: process.pid, cmd: process.cmd }
            });
            resolve(processList);
        } catch (e) {
            global.log(e, 'getProcessCount error');
            reject(e);
        }
    });
}

module.exports = {
    getProcessList,
    getFileTypeNames,
    execute,
    executeOutputFileValidation,
    isRunning,
    GetAllFiles
};