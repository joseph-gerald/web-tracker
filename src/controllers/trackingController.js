const UAParser = require('ua-parser-js');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const NodeRSA = require('node-rsa');
const key = new NodeRSA({ b: 1024 });
const JSEncrypt = require('node-jsencrypt');
const encryptor = new JSEncrypt();

const { minify } = require("terser");

encryptor.setPublicKey(key.exportKey('public'));
encryptor.setPrivateKey(key.exportKey('private'));

const aesjs = require('aes-js');

const clients = [];

function encode(string) {
    return btoa(encodeURI(string));
}

function decode(string) {
    return decodeURI(atob(string));
}

class Client {
    constructor(headers, prevId) {
        let parser = new UAParser(headers["user-agent"]);
        this.ip = headers["cf-connecting-ip"];
        this.id = randomUUID();

        this.prevId = prevId;

        this.connection = null;

        this.headers = headers;
        this.agent = parser.getResult();

        this.lifespan = {
            start: Date.now(),
            end: null
        }

        this.nonce = Math.floor(Math.random() * 1000000);
        this.stage = 0;

        this.aes = {
            iv: null,
            key: null,

            pad: data => {
                var blockSize = 16;
                var paddingSize = blockSize - (data.length % blockSize);
                var padding = new Array(paddingSize + 1).join(String.fromCharCode(paddingSize));
                return data + padding;
            },

            unpad: data => {
                var paddingSize = data[data.length - 1];
                return data.splice(0, data.length - paddingSize);
            },

            encrypt: data => {
                const encryptor = new aesjs.ModeOfOperation.cbc(this.aes.key, this.aes.iv);
                const textBytes = aesjs.utils.utf8.toBytes(this.aes.pad(data));
                return aesjs.utils.hex.fromBytes(encryptor.encrypt(textBytes));
            },

            decrypt: data => {
                const decryptor = new aesjs.ModeOfOperation.cbc(this.aes.key, this.aes.iv);
                return this.aes.unpad([...decryptor.decrypt(aesjs.utils.hex.toBytes(data))]).map(byte => String.fromCharCode(byte)).join("");
            }
        }
    }

    send(type, data = "") {
        try {
            this.connection.send(this.aes.encrypt([type, typeof data == "object" ? JSON.stringify(data) : data].map(part => encode(part).replaceAll("=", "")).join("/")));
        } catch (error) {
            console.log(error);
        }
    }
}

const env = {
    mode: process.env.NODE_ENV,
    public_key: key.exportKey('public')
}

function readPrivate(file_path) {
    return fs.readFileSync(path.join(__dirname, '..', 'private', file_path)).toString();
}

module.exports = {
    getTrackingScript: async (req, res) => {
        const client = new Client(req.headers, req.cookies["client_id"]);
        clients.push(client);

        let tracker = readPrivate("tracker.js");

        const envClone = { ...env };

        envClone.client = client;

        const swaps = {
            $load_js__aesjs$: readPrivate("parts/aesjs.min.js"),
            $load_js__jsencrypt$: readPrivate("parts/jsencrypt/jsencrypt.min.js"),
            $load_js__connectivity$: readPrivate("parts/connectivity.js"),
            $env_def$: JSON.stringify(envClone)
        }

        Object.entries(swaps).forEach(element => {
            tracker = tracker.replace(element[0], element[1]);
        });

        res.cookie('client_id', client.id, { httpOnly: true });
        res.setHeader('Content-Type', 'application/javascript');

        const code = (await minify(tracker)).code;

        res.send(
            code
        );
    },
    clients,
    encryptor
}