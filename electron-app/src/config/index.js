const { env } = require('./env.json');

const config = {
	customURI: {
		protocol: "iwms:",
		delimitter: ":::"
	},
	clientUtility: {
		getVersion: () => env[global.MODE].version,
		baseFolder: process.env.IWMS_CLIENT,
		getSoftwareSource: () => env[global.MODE].clientUtilSource,
		softwareNames: {
			windows: {
				name: 'iwms-client-util-win',
				ext: '.exe'
			},
			mac: {
				name: 'iwms-client-util-macos',
				ext: ''
			},
			linux: {
				name: 'iwms-client-util-linux',
				ext: ''
			}
		}
	},
	baseFolderName: '.iwms',
	permission: {
		readOnly: '444'
	},
	server: {
		getToken: ()=> env[global.MODE].serverToken
	},
	okm: {
		root: '\\okm:root'
	}
};

module.exports = {
	config
};