// All the code is scoped in a IIFE to prevent global pollution

/* ###################### */
/* #### IMPORT START #### */
/* ###################### */

$load_js__aesjs$
$load_js__jsencrypt$
$load_js__connectivity$

/* ###################### */
/* ##### IMPORT END ##### */
/* ###################### */

let stage = 0;
let connection = null;

const env = $env_def$;

const init_vec = Array.from({ length: 16 }, () => Math.floor(Math.random() * 94));
const key = Array.from({ length: 16 }, () => Math.floor(Math.random() * 94));

function stringifyArray(array) {
    return array.map(byte => String.fromCharCode(32 + byte)).join("");
}

function toHex(str) {
    var result = '';
    for (var i = 0; i < str.length; i++) {
        result += str.charCodeAt(i).toString(16);
    }
    return result;
}

function pad(data) {
    var blockSize = 16;
    var paddingSize = blockSize - (data.length % blockSize);
    var padding = new Array(paddingSize + 1).join(String.fromCharCode(paddingSize));
    return data + padding;
}

function unpad(data) {
    var paddingSize = data[data.length - 1];
    return data.splice(0, data.length - paddingSize);
}

const isLocalhost = window.location.host.indexOf("localhost") == 0;
const protocol = isLocalhost ? "ws://" : "wss://";

const socket = new WebSocket(protocol + window.location.host);

const logs = document.getElementById("logs");
const mode = env.mode;

const serverEncryptor = new JSEncrypt();

serverEncryptor.setPublicKey(env.public_key);

function encrypt(data) {
    const encryptor = new aesjs.ModeOfOperation.cbc(key, init_vec);
    const textBytes = aesjs.utils.utf8.toBytes(pad(data));
    return aesjs.utils.hex.fromBytes(encryptor.encrypt(textBytes));
}

function decrypt(data) {
    const decryptor = new aesjs.ModeOfOperation.cbc(key, init_vec);
    return unpad([...decryptor.decrypt(aesjs.utils.hex.toBytes(data))]).map(byte => String.fromCharCode(byte)).join("");
}

function addLog(message) {
    const log = document.createElement("span");
    log.classList.add("log");

    log.innerHTML = `<span class="gray"><span>${new Date().toLocaleTimeString()}.${Date.now() % 1000}</span></span> ${message}`;
    logs.appendChild(log);
}

function log(log) {
    console.log(log);
}

socket.onopen = () => {
    addLog("1/3 Established connection to server");

    const payload = serverEncryptor.encrypt(
        [
            env.client.id,
            stringifyArray(init_vec),
            stringifyArray(key)
        ].map(part => btoa(encodeURI(part))).join(":"));

    socket.send(toHex(payload))

    stage = 1;
    addLog("2/3 Exchanging secret with server...");
}

socket.onmessage = (event) => {
    const message = event.data;

    const [date, nonce] = decrypt(message).split(":").map(part => parseInt(part));
    const time = Date.now();

    socket.send(encrypt(`${time}:${nonce + (time - date)}`));
    addLog("3/3 Successfully exchanged secret with server");

    connection = new Connection(socket, encrypt, decrypt);
}
