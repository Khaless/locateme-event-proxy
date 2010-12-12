
var sys = require("sys");
var rest  = require("./vendor/restler/restler");

exports.authenticate = function authenticate(global_state, client_state, params, response_id) {

	/* 
	 * Todo: Some Authentication and channel query protocol...
	 */
	client_state.authenticate(params["guid"]);
	sys.debug("Received Identity from client: " + client_state.guid);
	
	/* 
	 * Add this user to the global state collection as soon as we
	 * know who they are.
	 */
	global_state.add_client_state(client_state);

	/* 
	 * Join this user to the active topics they should be subscribed to.
	 *
	 * In this prorotype user:<lowercase guid>:topics is a set containing
	 * the topics they should be subscribed to.
	 *
	 * We also build up a picture of the initial state which this new joining
	 * client needs to see.
	 *
	 * e.g. the topics they belong to, the users in those topics
	 * and those users locations.
	 *
	 */
	var initial_state = { "events": {} };

	/*
	 * closure_count and the send_response function
	 * will keep track of any closures we have outstanding (waiting
	 * for data). when all of them have returned a response will be
	 * sent back to the client.
	 *
	 * Approach:
	 * Increment the closure_count before we make any closures.
	 * any closures which return decrement the count. if the count reaches
	 * 0 then we send the response back.
	 */
	var closure_count = 0;
	var send_response = function() {
		closure_count--;
		if(closure_count == 0) {
			/* authorization response (carries full state as payload) */
			client_state.client.send({
				result: initial_state,
				error: null,
				id: response_id
			});
		}
	}
	closure_count++;
	global_state.commands_client.smembers("user:" + client_state.guid + ":events", function(err, event_guids) {
		if (err) util.log(err, "TODO: Error Handling..." + err);
		if (event_guids) {
			closure_count += event_guids.length;
			event_guids.forEach(function(event_guid) {
				sys.debug("Adding User " + client_state.guid + " to Event (topic) " + event_guid);
				global_state.add_client_to_topic(event_guid.toString(), client_state);
				initial_state["events"][event_guid] = { "users": {} };
				closure_count++;
				global_state.commands_client.smembers("event:" + event_guid.toString() + ":users", function(err, event_users) {
					if(event_users) {
						closure_count += event_users.length;
						event_users.forEach(function(user_guid) {
							initial_state["events"][event_guid]["users"][user_guid] = {};
							closure_count++;
							global_state.commands_client.get("user:" + user_guid + ":location", function(err, loc) {
								var obj = null;
								try {
									obj = JSON.parse(loc);
								}
								catch(e) { sys.debug(e); } // Parsing of json location string failed. It means the user probably has not sent a loc update.
								initial_state["events"][event_guid]["users"][user_guid]["location"] = obj;
								send_response();
							});
							send_response();
						});
					}
					send_response();
				});
				send_response();
			});
		}
		send_response();
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
		"type": "location_update",
		"user": client_state.guid,
		"data": params, //: todo passing user input to other users is bad. 2bfixed
		"event": null // Will be filled in with the event that this location_update is targeted to
		};
		client_state.topics.forEach(function(topic) {
			msg["event"] = topic;
			global_state.commands_client.publish("topic:event:" + topic, JSON.stringify(msg), function(err, res) {
				if(res != true) {
				sys.debug("Error publishing to topic " + topic);
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

exports.join_event = function join_event(global_state, client_state, params, response_id) {
		proxy_to_app(
			global_state, 
			"events/" + params["guid"] + "/join/", { /* No Data */ }, { 
				/* Trusted Identification Header */
				"X-Authenticated-By-Proxy":  client_state.guid
			}, function(data, response) {
				/* Success */
				client_state.client.send({result: data, error: null, id: response_id});
			}, function(data, response) {
				/* Error */
				sys.debug("Error on join_event");
				client_state.client.send({result: null, error: "Error", id: response_id});
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
