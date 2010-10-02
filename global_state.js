
GlobalState = function(pubsub_client) {

	/* */
	this.pubsub_client = pubsub_client;
	
	/* Various indirections to a client's state */
	this.cstate_by_session_id = {};
	this.cstate_by_guid = {};
	this.cstate_by_topic = {};
	this.count = 0;

}

GlobalState.prototype = {

	topic_callback: function topic_callback(topic, data) {
		try {
			for(var i in this.cstate_by_topic[topic]) {
				this.cstate_by_topic[topic][i].client.send(data);
			}
		} catch(e) {
			console.log("Received publish for unknown topic");
		}
	},

	num_clients: function() {
		return this.count;
	},
	
	add_client_state: function add_client_state(client_state) {
		this.cstate_by_session_id[client_state.client.sessionId] = client_state;
		this.cstate_by_guid[client_state.guid] = client_state;
		this.count++;
	},

	add_client_to_topic: function add_client_to_topic(topic, client_state) {
	
		if(!this.cstate_by_topic[topic]) {
			/* Topic is new and not subscribed to either. */
			this.cstate_by_topic[topic] = [];
			/* pubsub_client and topic_callback abstraction leak */
			var self = this;
			pubsub_client.subscribeTo(topic, function(){self.topic_callback.apply(self, arguments)} );
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
		delete this.cstate_by_session_id[client_state.client.sessionId];
		delete this.cstate_by_guid[client_state.guid];
		this.remove_client_from_all_topics(client_state);
		this.count--;
	}

}
