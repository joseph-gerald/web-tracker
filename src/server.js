const trackingController = require('./controllers/trackingController');

const handlers = [
    TelemetryHandler,
] = [
    require('./handlers/telemetryHandler'),
]

let connections = [];

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i !== bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function handleConnection(connection, request) {
    const headers = request.headers;
    const cookie = request.headers.cookie;

    let client = null;

    if (
        !cookie ||
        !trackingController.clients.map(client => client.id).find(id => cookie.includes(id))
    ) return connection.close();

    connections.push(connection);

    function onClose() {
        console.log(`Connection Closed`);

        var position = connections.indexOf(connection);
        connections.splice(position, 1);
    }

    function onMessage(data) {
        if (client == null) {
            const [id, initialization_vector, key] = trackingController.encryptor.decrypt(
                new TextDecoder().decode(hexToBytes(data))
            ).split(":").map(part => decodeURI(atob(part)));

            //console.log(id, initialization_vector, key)

            console.log(`New client connected with id: ${id}`);
            client = trackingController.clients.find(client => client.id == id);

            if (client == null || !cookie.includes(client.id) || client.connection) return connection.close();

            client.connection = connection;

            client.aes.iv = initialization_vector.split("").map(byte => byte.charCodeAt() - 32);
            client.aes.key = key.split("").map(byte => byte.charCodeAt() - 32);

            connection.send(client.aes.encrypt(`${client.lifespan.start}:${client.nonce}`));

            client.stage = 0;
            return;
        }

        switch (client.stage) {
            case 0:
                const [date, nonce] = client.aes.decrypt(data).split(":");
                const deltaTime = date - client.lifespan.start;

                const valid = deltaTime == nonce - client.nonce;

                if (!valid) return connection.close();
                client.stage = 1;
                break;
            case 1:
                {
                    const [type, msgData] = client.aes.decrypt(data).split("/").map(part => decodeURI(atob(part)));

                    switch (type) {
                        case "PING":
                            const count = parseInt(msgData);
                            client.send("PONG", count);
                            break;
                        default:
                            for (const handler of handlers) {
                                if (handler.handles(type)) {
                                    handler.handle(session, type, data);
                                }
                            }
                            console.log(`INCOMING: ${type} ${msgData}`);
                    }
                }
                break;
        }
    }

    connection.on('message', data => {
        try {
            onMessage(data.toString())
        } catch (error) {
            connection.close();
            console.log(error)
        }
    });

    connection.on('close', onClose);
}

module.exports = handleConnection;