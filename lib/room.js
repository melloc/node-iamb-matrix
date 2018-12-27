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
var mod_taiga = require('taiga');
var mod_util = require('util');

var MatrixMessage = require('./message');

// --- Internal helpers

function compareMessages(a, b) {
    var ac = a.created();
    var bc = b.created();

    if (ac < bc) {
        return (-1);
    } else if (ac === bc) {
        return (0);
    } else {
        return (1);
    }
}



// --- Exports

function MatrixRoom(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.id, 'opts.id');
    assert.object(opts.aliases, 'opts.aliases');
    assert.object(opts.info, 'opts.info');
    assert.object(opts.client, 'opts.client');
    assert.object(opts.users, 'opts.users');

    this.log = opts.log;
    this.mxr_aliases = opts.aliases;
    this.mxr_client = opts.client;
    this.mxr_users = opts.users;

    this.mxr_id = opts.id;
    this.mxr_alias = null;
    this.mxr_name = null;

    this.mxr_msgs = new mod_taiga.AVLTree({
        compare: compareMessages
    });

    this._syncRoom(opts.info);

    mod_events.EventEmitter.call(this);
}
mod_util.inherits(MatrixRoom, mod_events.EventEmitter);

MatrixRoom.prototype._handle = function handleState(event) {
    switch (event.type) {
    case 'm.room.name':
        this.mxr_name = event.content.name;
        break;

    case 'm.room.topic':
        this.mxr_topic = event.content.topic;
        break;

    case 'm.room.canonical_alias':
        this.mxr_alias = event.content.alias;
        this.mxr_aliases[this.mxr_alias] = this;
        break;

    case 'm.room.aliases':
        /*
         * XXX: Collect additional aliasing information, so that people can
         * switch to viewing rooms using them.
         */
        break;

    case 'm.room.member':
        this._userUpdate(event);
        break;

    case 'm.room.message':
        this._loadPost(event);
        break;

    case 'm.room.avatar':
        /*
         * Currently we do nothing with the room avatar information, since we
         * only currently care about terminal interfaces.
         */
        break;

    case 'm.room.related_groups':
        /*
         * As far as I've been able to tell, "related_groups" isn't currently
         * ever actually set to anything other than an empty array, and Riot
         * doesn't have a way to set it. Since it's not in the specification
         * either, we'll just ignore it for now.
         */
        break;

    case 'm.room.create':
        break;

    case 'm.room.join_rules':
        break;

    case 'm.room.history_visibility':
        break;

    case 'm.room.power_levels':
        break;

    case 'm.room.guest_access':
        break;

    case 'm.room.encryption':
        break;

    case 'm.room.encrypted':
        break;

    case 'm.room.third_party_invite':
        break;

    case 'org.matrix.room.preview_urls':
        break;

    default:
        this.log.warn({
            event: event
        }, 'unknown event type %j', event.type);
        break;
    }
};

MatrixRoom.prototype._ephemeral = function handleEphemeral(ephemeral) {
    switch (ephemeral.type) {
    case 'm.receipt':
        break;
    case 'm.typing':
        break;
    default:
        this.log.warn({
            ephemeral: ephemeral
        }, 'unknown ephemeral type %s', ephemeral.type);
        break;
    }
};

MatrixRoom.prototype._userUpdate = function userUpdate(event) {
    var speaker = this.mxr_users.getUser(event.sender, null);
    speaker.update(event);
};

MatrixRoom.prototype._loadPost = function loadPost(event) {
    var speaker = this.mxr_users.getUser(event.sender, null);
    var message = new MatrixMessage(this, speaker, event);

    this.mxr_msgs.insert(message);

    this.emit('message', message);
};

MatrixRoom.prototype._syncRoom = function syncRoom(info) {
    var self = this;

    info.state.events.forEach(function (s) {
        self._handle(s);
    });

    info.timeline.events.forEach(function (e) {
        self._handle(e);
    });

    info.ephemeral.events.forEach(function (e) {
        self._ephemeral(e);
    });
};

MatrixRoom.prototype.id = function getId() {
    return this.mxr_id;
};

MatrixRoom.prototype.alias = function getAlias() {
    return this.mxr_alias;
};

MatrixRoom.prototype.name = function getName() {
    return this.mxr_name;
};

MatrixRoom.prototype.sendMessage = function sendMessage(msg, cb) {
    assert.string(msg, 'msg');
    assert.func(cb, 'cb');

    this.mxr_client.sendMessage(this.mxr_id, msg, cb);
};

MatrixRoom.prototype.forEachMessage = function forEachMessage(f) {
    this.mxr_msgs.forEach(f);
};

module.exports = MatrixRoom;
