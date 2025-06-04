const os = require('os');
const type = os.type();
const { spawn } = require('child_process');
const {PSRunner} = require('../PSRunner');

function closeExplorer(path) {
    return new Promise(async (resolve) => {
        switch (type) {
            case 'Windows_NT':
                const commands = [];
                commands.push(`$folder = [uri]'${path.replace(/ /g, "` ").replace(/\(/g, "`(").replace(/\)/g, "`)")}'; foreach ($w in (New-Object -ComObject Shell.Application).Windows()) { if ($w.LocationURL -ieq $folder.AbsoluteUri) { $w.Quit(); break }}`);
                await PSRunner(commands);
                break;
            case 'Darwin':
                break;
            default:
                break;
        }
        resolve(true);
    })
}

function openExplorer(path) {
    const command = type == 'Windows_NT' ? 'start' : (type == 'Darwin' ? 'open' : 'xdg-open');
    path = type == 'Windows_NT' ? ["\"\"", `"${path.replace(/\//g, '\\')}"`] : [path];
    spawn(command, path, { shell: true, detached: true, windowsVerbatimArguments: true }).on('message', (msg) => {
        global.log(msg);
    }).on('error', (err) => {
        global.log(err, 'openExplorer error');
    })
}

const openFolder = (path) => {
    openExplorer(path);
}

module.exports = {
    openFolder,
    closeExplorer
};