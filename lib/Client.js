const DefaultOptions = require("./util/DefaultOptions");
const Gateway = require("./gateway");

class Client extends EventHandler {
    /**
     * Create a new discord client
     * @param {Object} ClientOptions
     * @property {String} token
     * @property {Number} intents
     * @property {Boolean} reconnect
     * @property {Boolean} debug
     */
    constructor(options) {
        super();

        this.options = Object.assign(DefaultOptions, options);

        this.gatewayAddress = "wss://gateway.discord.gg/?v=10&encoding=json";

        this.connected = [Status.Connected, Status.Ready];
    }

    /**
     * Connect client to discord
     * @param {string} token
     */
    connect(token) {
        if (!token) throw new Error("Token is required to connect to discord");
        this.gateway = new Gateway(this);
        this.gateway.connect();
    }
}

module.exports = Client;