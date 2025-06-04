var PSRunner = function (commands) {
    return new Promise(async (resolve) => {
        var self = this;
        var results = [];
        for (let index = 0; index < commands.length; index++) {
            let executeCommand = (cmd) => {
                return new Promise((resolve) => {
                    try {
                    let spawn = require("child_process").spawn;
                    let child = spawn("powershell.exe", ["-Command", "-"],{shell:false,windowsHide:true});
                    self.out = [];
                    self.err = [];
                    child.stdin.write('cd c:\\ \n');
                    child.stdin.write(cmd + '\n');
                    child.stdout.setEncoding('utf8');
                    child.stdout.on("data", function (data) {
                        self.out.push(data);
                    });
                    child.stderr.setEncoding('utf8');
                    child.stderr.on("data", function (data) {
                        self.err.push(data);
                    });
                    child.on('close', function (code) {
                        resolve({ command: cmd, output: self.out.join("\n"), errors: self.err.join("\n") });
                    })
                    child.stdin.end();
                } catch (error) {
                       console.log(error); 
                }
                })
            }
            const cmd = commands[index];
            let out = await executeCommand(cmd);
            results.push(out);
        }
        resolve(results);
    })
}

module.exports = {
    PSRunner
}