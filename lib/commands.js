
var sys = require("sys");

/*
 * If not using NPM:
 * var rest  = require("./vendor/restler/restler");
 *
 * If using NPM:
 */
var rest  = require("restler");

exports.authenticate = function authenticate(global_state, client_state, params, response_id) {

	/*
	 * Authenticate this user by calling the web-channel event-proxy/api/authenticate_user method.
	 * if successful, this will return a JSON object with the users state. We then use this
	 * state to subscribe the event proxy & user to the relevant topics and then
	 * send this state on to the user.
	 */
	proxy_to_app(
		global_state, 
		"sys/event-proxy/api/authenticate_user", {
			"email": params["email"],
			"password": params["password"]
		}, { 
			"X-Proxy-Authentication-Secret": "abcd123"
		}, function(data, response) {
			/* HTTP Success */
			if (data.error == null) {

				/* Authentication Success */

				// Update ClientState with guid and add it to the global state.
				sys.debug("Received Identity from client: " + data.result.guid);
				client_state.authenticate(data.result.guid); 
				global_state.add_client_state(client_state);

				// Add user's events to the ClientState via the GlobalState add_client_to_topic
				// method.  This will cause the EP to subscribe to topics if required.
				data.result.events.forEach(function(evt) {
					sys.debug("Adding User " + client_state.guid + " to Event (topic) " + evt.guid);
					global_state.add_client_to_topic(evt.guid, client_state);
				});

				/* Relay success response to client */
				client_state.client.send({result: data.result, error: null, id: response_id});
			}
			else {
				/* Authentication Failure */
				client_state.client.send({result: null, error: data.error, id: response_id});
			}
		}, function(data, response) {
			/* HTTP Error */
			sys.debug("Transport or HTTP error on authenticate_user");
			client_state.client.send({result: null, error: "Authentication Error", id: response_id});
	});
}

exports.location_update = function location_update(global_state, client_state, params, response_id) {
	/* todo: sanitize input */
	global_state.commands_client.set("user:" + client_state.guid + ":location", JSON.stringify(params), function(err, res) {
		if(res != true) {
			sys.debug("Error updating location for " + client_state.guid + ": " + err);
		}
		else {
			/* Update was successful. Write to the Event topics which this user is a part of. */
			var msg = {
			"notification": "location_update",
			"user": client_state.guid,
			"event": null, // Will be filled in with the event that this location_update is targeted to
			"data": params, //todo: passing user input to other users is bad. 2bfixed
			};
			client_state.topics.forEach(function(topic) {
				msg["event"] = topic;
				global_state.commands_client.publish("topic:event:" + topic, JSON.stringify(msg), function(err, res) {
					if(err != null) {
						sys.debug("Error publishing to topic " + topic + ": res=" + res + ", err=" + err);
					}
				});
			});
		}
	});
}

exports.create_event = function create_event(global_state, client_state, params, response_id) {
		proxy_to_app(
			global_state, 
			"events/", { 
				name: params["name"]
			}, { 
				/* Trusted Identification Header */
				"X-Authenticated-By-Proxy":  client_state.guid
			}, function(data, response) {
				/* Success */
				client_state.client.send({result: data, error: null, id: response_id});
			}, function(data, response) {
				/* Error */
				sys.debug("Error on create_event");
				client_state.client.send({result: null, error: "Error", id: response_id});
		});
}

/*
 * Join an event based a parameter (guid or shorthash).
 *
 * Guid is the events guid. 
 * Shorthash is an indirection to an events guid.
 *
 * This call will proxy the call to the web-channel restful endpoint
 * for joining the event at guid.
 *
 * If a ShortHash is supplied the event proxy will look up the guid via
 * the indirection and then do the same as when supplied with a guid.
 */
exports.join_event = function join_event(global_state, client_state, params, response_id) {
	
	var fn = function(guid) {
		proxy_to_app(
			global_state, 
			"events/" + guid + "/join/", { /* No Data */ }, { 
				/* Trusted Identification Header */
				"X-Authenticated-By-Proxy":  client_state.guid
			}, function(data, response) {
				/* Success */
				client_state.client.send({result: data, error: null, id: response_id});
			}, function(data, response) {
				/* Error */
				client_state.client.send({result: null, error: "Error", id: response_id});
		});
	};
	
	if(params["guid"]) fn(params["guid"]);
	else if(params["shorthash"]) {
		/* lookup event guid of this shorthash then call do */
		global_state.commands_client.get("indirection:event:shorthash:" + params["shorthash"], function(err, res) {
			if(err) {
				client_state.client.send({result: null, error: "Error", id: response_id});
				return;
			}
			fn(res);
		});
	}
	else {
		client_state.client.send({result: null, error: "Error: Invalid parameters supplied", id: response_id});
	}
}

exports.leave_event = function create_user(global_state, client_state, params, response_id) {
		proxy_to_app(
			global_state, 
			"events/" + params["guid"] + "/leave", {
			}, { 
				/* Trusted Identification Header */
				"X-Authenticated-By-Proxy":  client_state.guid
			}, function(data, response) {
				/* Success */
				client_state.client.send({result: data, error: null, id: response_id});
			}, function(data, response) {
				/* Error */
				sys.debug("Error on leave_event");
				client_state.client.send({result: null, error: data.error, id: response_id});
		});
}

exports.create_user = function create_user(global_state, client_state, params, response_id) {
		proxy_to_app(
			global_state, 
			"account/register", {
				"email": params["email"],
				"password": params["password"]
			}, { /* No Headers */ }, function(data, response) {
				/* Success */
				client_state.client.send({result: data, error: null, id: response_id});
			}, function(data, response) {
				/* Error */
				sys.debug("Error on create_user");
				client_state.client.send({result: null, error: data.errors, id: response_id});
		});
}

function proxy_to_app(global_state, path, data, headers, onSuccess, onError)  {
	// Call Website RESTful service to create an event
	headers["Accept"] = "application/json"; // use JSON interface
	rest.post(global_state.api_base_url + path, {
		data: data,
		headers: headers
	}).addListener("success", onSuccess).addListener("error", onError);
}
