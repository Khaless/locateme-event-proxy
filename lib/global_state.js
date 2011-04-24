var sys = require("sys");

module.exports = GlobalState;

function GlobalState(pubsub_client, commands_client, api_base_url) {

	this.pubsub_client = pubsub_client;
	this.commands_client = commands_client;
	this.api_base_url = api_base_url;
	
	/* Various indirections to a client's state */
	this.cstate_by_session_id = {};
	this.cstate_by_guid = {};
	this.cstate_by_topic = {};
	this.count = 0;

	/*
	 * Hook the topic_callback into the pubsub_client
	 */
	var self = this;
	this.pubsub_client.on("message", function() { self.topic_callback.apply(self, arguments) });

}

GlobalState.prototype = {

	topic_callback: function topic_callback(full_topic_name, data) {
		
		var parts = full_topic_name.toString().split(":"); // will be of format topic:<event or user>:<guid of event or user>
		var type = parts[1];
		var guid = parts[2];

		sys.debug("Received publication from " + full_topic_name.toString() + " of type " + type + " and guid " + guid + " containing `" + data.toString() + "`");

		var obj = null;
		try {
			obj = JSON.parse(data);
		} catch(e) {
			util.log("Subscribers recieved non-json message: " + data);
			return;
		}

		/* 
		 * Verify message is safe to send out to clients
		 * TODO: ...
		 */

		/* 
		 * If this message is published to a event topic then
		 * broadcast this message to all users which we're
		 * subscripting to this topic for.
		 *
		 * Else if this message is published to a user topic, then
		 * only post or act on it for a single user
		 */
		if(type == "event") {
			try {
				for(var i in this.cstate_by_topic[guid]) {
					this.cstate_by_topic[guid][i].client.send(obj);
				}
			} catch(e) {
				sys.debug("Received publish for unknown topic:event");
			}
		}
		else if(type == "user") {
			
			var state = null; // user state
			if(this.cstate_by_guid[guid]) {
				state = this.cstate_by_guid[guid]; 
			}
			else {
				sys.debug("Received publish for unknown topic:user");
			}
			
			/* 
			 * Dispatch based on types of events
			 */
			try {
				if(obj["notification"] == "user_joined_event") {
					sys.debug("Adding User " + state.guid + " to event " + obj["event"]);
					this.add_client_to_topic(obj["event"], state);
					state.client.send(obj);
				}
			}
			catch(e) {
				sys.debug("Error processing topic:user:<guid> publish: " + e.toString());
			}

		}
		else {
			console.log("Received publish for unknown topic type");
		}
	},

	num_clients: function() {
		return this.count;
	},
	
	add_client_state: function add_client_state(client_state) {
		this.cstate_by_session_id[client_state.client.sessionId] = client_state;
		this.cstate_by_guid[client_state.guid] = client_state;
		this.count++;

		/* Make sure the client is subscribed to their own special topic */
		var self = this;
		pubsub_client.subscribe("topic:user:" + client_state.guid);

	},

	add_client_to_topic: function add_client_to_topic(topic, client_state) {
	
		if(!this.cstate_by_topic[topic]) {
			/* Topic is new and not subscribed to either. */
			this.cstate_by_topic[topic] = [];
			/* pubsub_client and topic_callback abstraction leak */
			var self = this;
			/* we make sure to prefix the topic name with topic: */
			pubsub_client.subscribe("topic:event:" + topic);
		}

		if (!client_state.is_in_topic(topic)) {
			client_state.add_to_topic(topic);
			this.cstate_by_topic[topic].push(client_state);
		}
			
	},
	
	remove_client_from_all_topics: function remove_client_from_all_topics(client_state) {
		for (var i in client_state.topics) {
			if(this.cstate_by_topic[client_state.topics[i]]) {
				for (var j in this.cstate_by_topic[client_state.topics[i]]) {
					if (this.cstate_by_topic[client_state.topics[i]][j] == client_state) {
					 delete this.cstate_by_topic[client_state.topics[i]][j];
					}
				}
			}
		}
	},

	remove_client_state: function remove_client_state(client_state) {

		if(client_state.guid != null) {
			this.count--; // Dont count-- if they have not been identified
		}
		delete this.cstate_by_session_id[client_state.client.sessionId];
		delete this.cstate_by_guid[client_state.guid];
		this.remove_client_from_all_topics(client_state);
	}

}
