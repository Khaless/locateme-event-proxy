

ClientState = function(client) {

	this.state  = 0;
	this.guid   = null;
	this.topics = [];
	this.client = client;

}

ClientState.State = { "Initial": 0, "Identified": 1};

ClientState.prototype = {
	add_to_topic: function add_to_topic(topic) {
		if(!this.is_in_topic(topic)) {
			this.topics.push(topic);
		}
	},

	is_in_topic: function is_in_topic(topic) {
		for(var i in this.topics) {
			if (this.topics[i] == topic) return true;
		}
		return false;
	}

}

