const axios = require('axios');
const { createWriteStream, readFileSync } = require('fs');
const request = require('request');
const progress = require('request-progress');
const { basename } = require('path');

const _delete = (url, reqData, additionalHeaders = {}) => {
    return new Promise((resolve, reject) => {
        axios({
            method: 'delete',
            maxBodyLength: Infinity,
            url: url,
            data: reqData,
            headers: {
                "Access-Control-Allow-Origin": true,
                ...additionalHeaders
            }
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            global.log(err,'get');
            const message = err.response?.data?.message ? err.response.data.message : (err.response?.data ? err.response.data : err.message);
            reject({ status: false, message, additionalInfo: { url } });
        });
    });
};

const get = (url, reqData, additionalHeaders = {}) => {
    return new Promise((resolve, reject) => {
        axios({
            method: 'GET',
            url: url,
            data: reqData,
            headers: {
                "Access-Control-Allow-Origin": true,
                //'Content-Type': 'application/json',
                //'Accept': 'application/json',
                ...additionalHeaders
            }
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            global.log(err,'get');
            const message = err.response?.data?.message ? err.response.data.message : (err.response?.data ? err.response.data : err.message);
            reject({ status: false, message, additionalInfo: { url } });
        });
    });
};

const post = (url, reqData, additionalHeaders = {}) => {
    return new Promise((resolve, reject) => {
        axios({
            method: 'POST',
            url: url,
            data: reqData,            
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                "Access-Control-Allow-Origin": true,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...additionalHeaders
            }
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            global.log(err,'post');
            const message = err.response?.data?.message ? err.response.data.message : (err.response?.data ? err.response.data : err.message);
            reject({ status: false, message, additionalInfo: { url } });
        });
    });
};

const put = (url, reqData, additionalHeaders = {}) => {
    return new Promise((resolve, reject) => {
        axios({
            method: 'PUT',
            url: url,
            data: reqData,
            headers: {
                "Access-Control-Allow-Origin": true,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...additionalHeaders
            }
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            global.log(err,'put');
            const message = err.response?.data?.message ? err.response.data.message : (err.response?.data ? err.response.data : err.message);
            reject({ status: false, message, additionalInfo: { url } });
        });
    });
};

 const putStream = (url, src) => {
    return new Promise((resolve, reject) => {
        axios.put(url
            , readFileSync(src), {
            headers: {
                'Content-Type': 'application/octet-stream',
                'x-ms-blob-type': 'BlockBlob', // Or 'PageBlob' or 'AppendBlob'
            }
        }).then(response => {
            resolve(response);
        }).catch(err => {
            reject({ status: false, message: err.response ? err.response.data : err.message });
        })
    })
}

const upload = (url, reqData, additionalHeaders = {}) => {
    return new Promise((resolve, reject) => {
        axios({
            method: 'POST',
            url: url,
            data: reqData,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            maxRedirects: 0,
            headers: {
                "Access-Control-Allow-Origin": true,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...additionalHeaders
            }
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            const message = err.response?.data?.message ? err.response.data.message : (err.response?.data ? err.response.data : err.message);
            reject({ status: false, message, additionalInfo: { url } });
        });
    });
};

const download = (url, dest, mode = undefined) => {
    const fileName = basename(dest);
    return new Promise((resolve, reject) => {
        global.log(`download started for ${fileName}`);
        const writeStream = createWriteStream(dest, { mode });
        writeStream.on('close', () => {
            global.log(`File closed (${fileName})`);
            resolve();
        });
        progress(request(url))
            .on('progress', (state) => {
                state.fileName = fileName;
                global.log(state, 'download progress');
            })
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                global.log(`download completed for ${fileName}`);
            })
            .pipe(writeStream);
    });
}

module.exports = {
    get, post, put, putStream, download, upload, _delete
};