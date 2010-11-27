
var events = require("events");

module.exports = Dispatcher;

function Dispatcher() {
	events.EventEmitter.call(this);
}

Dispatcher.super_ = events.EventEmitter;
Dispatcher.prototype = Object.create(events.EventEmitter.prototype, {
	constructor: {
		value: Dispatcher,
		enumerable: false
	}
});

Dispatcher.prototype.dispatch_message = function(client, state, message) {
	
	if(!message.method || !message.params[0]) {
		client.send({
			result: null,
			error: "Malformed Call",
			id: message.id
		});
	}

	/* Only allow calls to authenticate if the client is not yet authenticated */
	if (state.state == ClientState.State.Initial && message.method != "authenticate") {
		client.send({
			result: null,
			error: "Not Authorized",
			id: message.id
		});
		return;
	}

	this.emit(message.method, client, state, message.params[0], message.id);
}
