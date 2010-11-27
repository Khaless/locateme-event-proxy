
var events = require("events");

module.exports = Dispatcher;

function Dispatcher(global_state) {
	events.EventEmitter.call(this);
	this.global_state = global_state;
}

Dispatcher.super_ = events.EventEmitter;
Dispatcher.prototype = Object.create(events.EventEmitter.prototype, {
	constructor: {
		value: Dispatcher,
		enumerable: false
	}
});

Dispatcher.prototype.dispatch_message = function(client_state, message) {
	
	if(!message.method || !message.params[0]) {
		client_state.client.send({
			result: null,
			error: "Malformed Call",
			id: message.id
		});
		return;
	}

	/* Only allow calls to authenticate if the client is not yet authenticated */
	if (!client_state.authenticated() && message.method != "authenticate") {
		client_state.client.send({
			result: null,
			error: "Not Authorized",
			id: message.id
		});
		return;
	}

	this.emit(message.method, this.global_state, client_state, message.params[0], message.id);

}
