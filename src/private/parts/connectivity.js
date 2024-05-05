function encode(string) {
    return btoa(encodeURI(string));
}

function decode(string) {
    return decodeURI(atob(string));
}


class EventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }

        this.listeners[event].push(callback);
    }

    remove(callback, event) {
        if (event) {
            if (this.listeners[event]) {
                this.listeners[event] = this.listeners[event].filter((cb) => cb != callback);
            }
        } else {
            for (const [event, callbacks] of Object.entries(this.listeners)) {
                this.listeners[event] = callbacks.filter((cb) => cb != callback);
            }
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach((callback) => callback(data));
        }
    }
}

class Connection {
    constructor(socket, encrypt, decrypt) {
        this.socket = socket;
        this.events = new EventBus();
        this.pings = {};
        this.ping = -1;
        this.keepalive = 0;
        this.ping_history = [];
        this.lagging = false;

        setInterval(() => {
            this.sendPing();
        }, (isLocalhost ? 30 : 0.3) * 1000);

        window.connected = true;
        this.sendPing();

        socket.onclose = () => {
            setTimeout(() => location.reload(), 3000);
        }

        this.socket.onmessage = (event) => {
            const message = decrypt(event.data);

            if (message.indexOf("PONG") == 0) {
                const count = parseInt(atob(message.split("/")[1]));
    
                const ping = Date.now() - this.pings[count];
                delete this.pings[count];

                this.ping = ping;
                
                this.ping_history.push(ping);
                this.ping_history = this.ping_history.slice(-100);
                return;
            }

            const [type, data] = message.split("/").map(part => decode(part));
            console.log("INCOMING", type, data);

            this.events.emit(type, (() => {
                try {
                    return JSON.parse(data)
                } catch {
                    return data;
                }
            })());
        }
    }

    send(type, data = "") {
        console.log("OUTGOING", type, data);
        this.socket.send(encrypt([type, typeof data == "object" ? JSON.stringify(data) : data].map(part => encode(part).replaceAll("=", "")).join("/")));
    }

    sendPing() {
        const count = this.keepalive++;
        this.send("PING", count);

        if (this.ping_history.reduce((a, b) => a + b, 0) / this.ping_history.length < 300) this.lagging = false;
        if (Object.keys(this.pings).length > 0) this.lagging = true;

        this.pings[count] = Date.now();
    }
}