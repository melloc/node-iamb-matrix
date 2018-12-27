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
var mod_path = require('path');
var mod_restify = require('restify-clients');
var VError = require('verror');

function RawMatrixClient(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.account, 'opts.account');
    assert.string(opts.account.url, 'opts.account.url');
    assert.optionalObject(opts.agent, 'opts.agent');

    this.token = '';

    this.client = mod_restify.createJsonClient({
        agent: opts.agent,
        url: opts.account.url
    });
}

RawMatrixClient.prototype._headers = function () {
    return {
        'Authorization': 'Bearer ' + this.token
    };
};

RawMatrixClient.prototype._pathObj = function () {
    var path = '/_matrix/client/r0' + mod_path.join.apply(null, arguments);
    return {
        path: path,
        headers: this._headers()
    };
};

RawMatrixClient.prototype._handlecb = function (callback) {
    var self = this;

    return function (err, req, res, body) {
        if (err && body &&
            body.id === 'api.context.session_expired.app_error') {
            self.emit('reauthAsserted');
            // XXX: update for matrix
            callback(new VError('client needs to reauthenticate'));
            return;
        }

        callback(err, body);
    };
};

RawMatrixClient.prototype.login = function (username, password, callback) {
    assert.string(username, 'username');
    assert.string(password, 'password');
    assert.func(callback, 'callback');

    this.client.post('/_matrix/client/r0/login', {
        type: 'm.login.password',
        initial_device_display_name: 'iamb',
        user: username,
        password: password
    }, this._handlecb(callback));
};

RawMatrixClient.prototype.logout = function (callback) {
    assert.func(callback, 'callback');

    this.client.post(this._pathObj('/logout'),
        this._handlecb(callback));
};

RawMatrixClient.prototype.whoami = function (callback) {
    assert.func(callback, 'callback');

    this.client.get(this._pathObj('/account/whoami'),
        this._handlecb(callback));
};

/*
 * Fetch state information from the server since a previous sync. If an
 * empty parameter obejct is provided, then this will fetch the initial
 * client state. The server will return an object that looks like:
 *
 *    {
 *        next_batch: '...',
 *        device_one_time_keys_count: {},
 *        account_data: { events: [] },
 *        to_device: { events: [] },
 *        groups: { leave: {}, join: {}, invite: {} },
 *        presence: { events: [] },
 *        device_lists: { changed: [], left: [] },
 *        rooms: { leave: {}, join: {}, invite: {} }
 *    }
 *
 */
RawMatrixClient.prototype.sync = function (params, callback) {
    assert.object(params, 'params');
    assert.func(callback, 'callback');

    this.client.get({
        path: '/_matrix/client/r0/sync',
        headers: this._headers(),
        query: params
    }, this._handlecb(callback));
};

RawMatrixClient.prototype.listJoinedRooms = function (callback) {
    assert.func(callback, 'callback');

    this.client.get(this._pathObj('/joined_rooms'),
        this._handlecb(callback));
};

RawMatrixClient.prototype.getRoomState = function (id, callback) {
    assert.string(id, 'id');
    assert.func(callback, 'callback');

    this.client.get(this._pathObj('/rooms', id, 'state'),
        this._handlecb(callback));
};

/*
 * Send a new plain text message to a given room.
 *
 * In the future, it would be nice to figure out what encoding Markdown in
 * sent messages would look like here.
 */
RawMatrixClient.prototype.sendMessage = function (id, msg, callback) {
    assert.string(id, 'id');
    assert.func(callback, 'callback');

    this.client.post(this._pathObj('/rooms', id, 'send', 'm.room.message'), {
        msgtype: 'm.text',
        body: msg
    }, this._handlecb(callback));
};

module.exports = RawMatrixClient;
