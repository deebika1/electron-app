const { PSRunner } = require("./PSRunner");
const {dirname} = require("path");
const fs = require("fs");

function isDir(path) {
    try {
        var stat = fs.lstatSync(path);
        return stat.isDirectory();
    } catch (e) {
        return false;
    }
}

function DeleteFilesPowerShellCommand(toDeletePath,userInfo) {
    return new Promise(async (resolve,reject) => {
        try {
            let domain = userInfo.Domain;
            let user = userInfo.Username;
            let password = userInfo.Password;
            let commands = [];
            let rst = await PSRunner([`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList 'Test-Path "${toDeletePath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}";' -Credential $mycreds -WindowStyle Hidden}`]);
            console.log(rst,'newrst')
            console.log('delete innn2')
            if (!rst[0].output.includes("False")) {
                if (isDir(toDeletePath)) {
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList 'Remove-Item "${toDeletePath.replace(/ /g, "` ").replace(/\(/g, "`(").replace(/\)/g, "`)")}" -Recurse -Force;' -Credential $mycreds -WindowStyle Hidden}`)
                }
                else {
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList 'Remove-Item "${toDeletePath.replace(/ /g, "` ").replace(/\(/g, "`(").replace(/\)/g, "`)")}" -Force -Recurse;' -Credential $mycreds -WindowStyle Hidden}`)
                }
                let result = await PSRunner(commands);
                if (result.filter(x => x.errors.length > 0).length > 0) {
                    //throw new Error(result.filter(x => x.errors.length > 0)[0].errors + "\n" + result.filter(x => x.errors.length > 0)[0].command);
                    throw new Error(`Error occured in deleting file at ${toDeletePath}`);
                } else {
                    resolve(true);
                }
            }
            else {
                resolve(true);
            }
        } catch (error) {
            reject(err);
        }        
    })
}
function CopyFilesPowerShellCommand(fileInfo, userInfo) {
    return new Promise(async (resolve, reject) => {
        try {
            let domain = userInfo.Domain;
            let user = userInfo.Username;
            let password = userInfo.Password;
            let commands = [];
            if (fileInfo.isDownload) {
                if (fileInfo.isFolder) {
                    throw new Error("Not Implemented folder copy");
                }
                else {
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList '(New-Item -ItemType Directory -Force -Path ${dirname(fileInfo.OutPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)"))}\)' -Credential $mycreds -WindowStyle Hidden}`);
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList 'Invoke-WebRequest -Uri "${fileInfo.InPath.replace(/ /g,"` ").replace(/&/g,"`&").replace(/\(/g,"`(").replace(/\)/g,"`)")}" -OutFile  "${fileInfo.OutPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}"' -Credential $mycreds -WindowStyle Hidden}`)
                }
            }
            else {
                if (fileInfo.isFolder) {
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList '(New-Item -ItemType Directory -Force -Path "${fileInfo.OutPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}\")' -Credential $mycreds -WindowStyle Hidden}`);
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList 'Copy-Item -Path "${fileInfo.InPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}\\*" -Destination "${fileInfo.OutPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}" -PassThru -Recurse -force;' -Credential $mycreds -WindowStyle Hidden}`)
                }
                else {
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList '(New-Item -ItemType Directory -Force -Path "${dirname(fileInfo.OutPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)"))}\")' -Credential $mycreds -WindowStyle Hidden}`);
                    commands.push(`& {$Username= '${domain}\\${user}' ;$Password = '${password}';$Pass = ConvertTo-SecureString $Password -AsPlainText -Force;$mycreds=New-Object System.Management.Automation.PSCredential($Username, $Pass);Start-Process powershell.exe -ArgumentList 'Copy-Item -Path "${fileInfo.InPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}" -Destination "${fileInfo.OutPath.replace(/ /g,"` ").replace(/\(/g,"`(").replace(/\)/g,"`)")}" -PassThru -Force -Recurse;' -Credential $mycreds -WindowStyle Hidden}`)
                }
            }
            let result = await PSRunner(commands);
            if (result.filter(x => x.errors.length > 0).length > 0) {
                //throw new Error(result.filter(x => x.errors.length > 0)[0].errors);
            throw new Error(`Error occured in copying file to ${fileInfo.OutPath}`);
            } else {
                resolve(true);
            }
        } catch (err) {
            reject(err);
        }
    });

}

module.exports = {
    CopyFilesPowerShellCommand,
    DeleteFilesPowerShellCommand
}