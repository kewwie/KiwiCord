const WebSocket = require("ws");
const ClientEvents = require("./util/ClientEvents");
const OpCodes = require("./util/OpCodes");

class Gateway {
    constructor(client) {
        this.client = client;

        this.sessionID = null;
        this.sequence = null;

        this.status = Status.Idle;
    }

    connect() {
        if (typeof this.client.options.token != "string") {
            return this.client.trigger(
                ClientEvents.Error,
                new Error("Token is invalid")
            );
        }
        this.connection = new WebSocket(this.client.gatewayAddress);
        this.connection.onopen = this.onOpen.bind(this);
        this.connection.onmessage = this.onMessage.bind(this);
        this.connection.onerror = this.onError.bind(this);
        this.connection.onclose = this.onClose.bind(this);
    }

    reconnect({ delay = 1000 }) {
        this.status = Status.Reconnecting;
        setTimeout(() => {
            this.connect();
        }, delay);
    }

    onOpen() {
        this.status = Status.Open;
    }

    onMessage({ data }) {
        this.onPacket(JSON.parse(data));
    }

    onError(error) {
        console.log(error);
    }

    onClose() {
        console.log("Closed");
    }

    send(data) {
        let body = JSON.stringify(data);
        this.connection.send(body);
    }

    setHeartbeat(interval) {
        if (interval === null) {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            return;
        } else if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(() => this.heartbeat(), interval);
    }

    heartbeat(ignore = false) {
        console.log("Heartbeat sent");
        if (!this.client.connected.includes(this.status)) {
            return;
        }

        if (ignore) {
            console.log(this.lastHeartbeatAck);
            if (!this.lastHeartbeatAck) {
                console.log("destory");
                return this.destroy(
                    { reconnect: "auto" },
                    new Error("Last Heartbeat Not Ack")
                );
            }
            this.lastHeartbeatAck = false;
        }

        this.lastHeartbeatSent = Date.now();
        this.post({ op: OpCodes.Heartbeat, d: this.sequence }, 5);
    }

    resume() {
        if (!this.sessionID) {
            return this.identify();
        }

        this.status = Status.Resuming;

        this.post(
            OpCodes.Identify,
            {
                token: this.client.options.token,
                session_id: this.sessionID,
                seq: this.sequence,
            },
            4
        );

        // Use resume event
    }

    identify() {
        return this.sessionID | this.tryIdentify();
    }

    tryIdentify() {
        if (!this.client.connected.includes(this.status)) {
            this.reIdentify(2500);
            return;
        }

        this.status = Status.Identifying;

        let identify = {
            token: this.client.options.token,
            intents: this.client.options.intents,
            large_threshold: 50,
            properties: {
                os: process.platform,
                browser: "discord",
                device: "discord",
            },
            /*presence: {
                activities: [{
                  name: "Discord",
                  type: 0
                }],
                status: "online",
                since: 91879201,
                afk: false
            },*/
        };

        if (this.client.options.activity) {
            identify.presence = this.client.options.activity;
        }

        if (this.client.options.shards > 1) {
            identify.shards = [this.id, this.client.options.shards];
        }

        this.send({ op: OpCodes.Identify, d: identify });
    }

    reIdentify(ms) {
        setTimeout(() => {
            this.identify();
        }, ms);
    }

    destroy({ reconnect = false, delay = 1000, clear = false }) {
        this.lastHeartbeatAck = null;
        this.lastHeartbeatSent = null;

        if (this.connection) {
            if (this.connection.readyState === WebSocket.OPEN) {
                this.connection.close();
            } else {
                this.connection.terminate();
            }

            this.connection = null;
        }

        this.status = Status.Disconnected;

        if (clear) {
            this.sessionID = null;
            this.resumeURL = null;
        }

        if (reconnect === "auto" && this.client.options.reconnect) {
            this.reconnect({ delay: delay });
        }
    }

    onPacket(packet) {
        if (packet.s > this.sequence) this.sequence = packet.s;
        switch (packet.op) {
            case OpCodes.Dispatch: {
                break;
            }

            case OpCodes.Heartbeat: {
                console.log("Heartbeat Requested");
                this.heartbeat(true);
                break;
            }

            case OpCodes.Identify: {
                console.log("Identify");
                break;
            }

            case OpCodes.Presence_update: {
                break;
            }

            case OpCodes.Voice_state_update: {
                break;
            }

            case OpCodes.Resume: {
                console.log("Resume");
                break;
            }

            case OpCodes.Reconnect: {
                break;
            }

            case OpCodes.Request_guild_members: {
                break;
            }

            case OpCodes.Invalid_session: {
                break;
            }

            case OpCodes.Hello: {
                console.log("Hello received");

                this.status = Status.Connected;
                this.setHeartbeat(packet.d.heartbeat_interval);

                if (this.sessionID) {
                    this.resume();
                    console.log("resume");
                } else {
                    this.identify();
                }
                break;
            }

            case OpCodes.Heartbeat_ack: {
                this.lastHeartbeatAck = true;
                console.log("Ack received");
                break;
            }
        }

        switch (packet.t) {
            case GatewayEvents.Ready: {
                this.sessionID = packet.d.session_id;
                this.client.id = packet.d.application.id;
                this.client.user = packet.d.user;

                this.status = Status.Ready;
                this.client.trigger(Events.ClientReady);

                break;
            }
            default: {
                if (packet.t != null) {
                    this.client.trigger(getEventName(packet.t), packet);
                }
            }
        }
        this.client.trigger("Raw", packet);
    }
}

module.exports = Gateway;
