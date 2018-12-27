/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Cody Mello.
 */

'use strict';

var assert = require('assert-plus');
var mod_events = require('events');
var mod_util = require('util');

// --- Exports

/*
 * This class represents a message in Matrix. `event` objects look like:
 *
 * {
 *     "origin_server_ts": 1540570982783,
 *     "sender": "@username:example.com",
 *     "event_id": "$12345678912345678901:example.com",
 *     "unsigned": {
 *       "age": 12345678
 *     },
 *     "content": {
 *       "body": "Hello there!",
 *       "msgtype": "m.text",
 *       "formatted_body": "Hello there!",
 *       "format": "org.matrix.custom.html"
 *     },
 *     "type": "m.room.message"
 * }
 *
 */
function MatrixMessage(room, speaker, event) {
    assert.object(room, 'room');
    assert.object(speaker, 'speaker');
    assert.object(event, 'event');
    assert.object(event.content, 'event.content');
    assert.number(event.origin_server_ts, 'event.origin_server_ts');

    this.mxm_room = room;
    this.mxm_speaker = speaker;
    this.mxm_event = event;
    this.mxm_id = event.event_id;
    this.mxm_type = event.content.msgtype;
    this.mxm_body = event.content.body;
    this.mxm_sender = event.sender;

    Object.seal(this);
}
mod_util.inherits(MatrixMessage, mod_events.EventEmitter);

MatrixMessage.prototype.speaker = function getSpeaker() {
    return this.mxm_speaker;
};

MatrixMessage.prototype.text = function getText() {
    return this.mxm_body;
};

MatrixMessage.prototype.created = function getCreated() {
    return this.mxm_event.origin_server_ts;
};

module.exports = MatrixMessage;
