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
var mod_fs = require('fs');
var mod_jsprim = require('jsprim');
var mod_mooremachine = require('mooremachine');
var mod_util = require('util');
var VError = require('verror');

var MatrixRoom = require('./room');
var MatrixUserDB = require('./users');
var RawMatrixClient = require('./raw');

// --- Globals


// --- Exports


function MatrixClient(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.account, 'opts.account');
    assert.string(opts.account.url, 'opts.account.url');
    assert.string(opts.account.username, 'opts.account.username');
    assert.optionalString(opts.account.password, 'opts.account.password');
    assert.optionalString(opts.account.token, 'opts.account.token');
    assert.ok(opts.account.token || opts.account.password,
        'one of opts.account.token or opts.account.password must be provided');

    this.log = opts.log;
    this.mxc_client = new RawMatrixClient(opts);

    this.mxc_acct = opts.account;
    this.mxc_user = null;

    this.mxc_users = new MatrixUserDB({
        client: this.mxc_client
    });

    this.mxc_nbatch = undefined;
    this.mxc_lasterr = null;

    this.mxc_rooms = {};
    this.mxc_aliases = {};
    this.mxc_direct = {};

    mod_mooremachine.FSM.call(this, 'authenticating');
}
mod_util.inherits(MatrixClient, mod_mooremachine.FSM);

MatrixClient.prototype.state_authenticating = function (S) {
    S.validTransitions([
        'authenticating.token',
        'authenticating.password',
        'connecting',
        'failed'
    ]);

    if (this.mxc_acct.token) {
        S.gotoState('authenticating.token');
    } else {
        S.gotoState('authenticating.password');
    }
};

MatrixClient.prototype.state_authenticating.token = function (S) {
    var self = this;

    S.immediate(function () {
        self.mxc_client.token = self.mxc_acct.token;
        self.mxc_client.whoami(function (err, obj) {
            if (err) {
                self.mxc_lasterr = err;
                S.gotoState('failed');
                return;
            }

            self.mxc_user = obj;

            S.gotoState('sync');
        });
    });
};

MatrixClient.prototype.state_authenticating.password = function (S) {
    var self = this;

    S.immediate(function () {
        self.mxc_client.login(self.mxc_acct.username, self.mxc_acct.password,
            function (err, obj) {
            if (err) {
                self.mxc_lasterr = err;
                S.gotoState('failed');
                return;
            }

            self.mxc_client.token = obj.access_token;
            /*
             * XXX: Not really the user info. Should fetch separately.
             */
            self.mxc_user = obj;

            S.gotoState('sync');
        });
    });
};


MatrixClient.prototype.state_sync = function (S) {
    var self = this;
    var opts = {};

    if (self.mxc_nbatch !== undefined) {
        opts.since = self.mxc_nbatch;
    }

    self.mxc_client.sync(opts, function (err, sinfo) {
        if (err) {
            self.mxc_lasterr = err;
            S.gotoState('sync.failed');
            return;
        }

        self._process(sinfo);

        if (self.mxc_nbatch === undefined) {
            /*
             * This is the first batch we've fetched, so we emit "connected"
             * to inform consumers that we're ready to be used.
             */
            self.emit('connected');
        }
        self.mxc_nbatch = sinfo.next_batch;

        S.gotoState('sync.wait');
    });
};


MatrixClient.prototype.state_sync.wait = function (S) {
    S.timeout(1000, function () {
        S.gotoState('sync');
    });
};

MatrixClient.prototype.state_sync.failed = function (S) {
    assert.ok(this.mxc_lasterr, 'last error is set');
    this.log.error(this.mxc_lasterr, 'sync has failed; will retry');

    S.timeout(1000, function () {
        S.gotoState('sync');
    });
};

MatrixClient.prototype.state_failed = function (S) {
    S.validTransitions([ ]);

    assert.ok(this.mxc_lasterr, 'last error is set');
    this.emit('error', new VError(this.mxc_lasterr, 'matrix client failure'));
};

MatrixClient.prototype._processAccountDataEvent = function (event) {
    switch (event.type) {
    case 'm.direct':
        this.mxc_direct = event.content;
        break;
    case 'm.push_rules':
        /*
         * XXX: These are the notification rules. Once iamb support
         * notificiations, we should hoook these up in some way.
         */
        break;
    default:
        this.log.warn({
            event: event
        }, 'unknown event type %j', event.type);
        break;
    }
};

MatrixClient.prototype._processAccountData = function (acinfo) {
    assert.object(acinfo, 'acinfo');
    assert.array(acinfo.events, 'acinfo.events');

    for (var i = 0; i < acinfo.events.length; i++) {
        this._processAccountDataEvent(acinfo.events[i]);
    }
};

MatrixClient.prototype._process = function (sinfo) {
    assert.object(sinfo, 'sinfo');

    mod_fs.appendFileSync('sync-room.out', JSON.stringify(sinfo));

    if (mod_jsprim.hasKey(sinfo, 'account_data')) {
        this._processAccountData(sinfo.account_data);
    }

    var invite = Object.keys(sinfo.rooms.invite);
    var leave = Object.keys(sinfo.rooms.leave);
    var join = Object.keys(sinfo.rooms.join);
    var room, i;

    for (i = 0; i < join.length; i++) {
        room = join[i];

        if (mod_jsprim.hasKey(this.mxc_rooms, room)) {
            this.mxc_rooms[room]._syncRoom(sinfo.rooms.join[room]);
            continue;
        }

        this.mxc_rooms[room] = new MatrixRoom({
            id: room,
            log: this.log,
            aliases: this.mxc_aliases,
            client: this.mxc_client,
            users: this.mxc_users,
            info: sinfo.rooms.join[room]
        });

        this.emit('room', this.mxc_rooms[room]);
    }

    for (i = 0; i < invite.length; i++) {
        // XXX: Figure out what handling invites should look like.
    }

    for (i = 0; i < leave.length; i++) {
        // XXX: Figure out what leaving a room should look like.
    }
};

MatrixClient.prototype.getRoomByName = function (name) {
    if (mod_jsprim.hasKey(this.mxc_rooms, name)) {
        /* This is a "!" room identifier */
        return this.mxc_rooms[name];
    }

    if (mod_jsprim.hasKey(this.mxc_aliases, name)) {
        /* This is a "#" room identifier */
        return this.mxc_aliases[name];
    }

    return null;
};

MatrixClient.prototype.getDirectByName = function (name) {
    if (!mod_jsprim.hasKey(this.mxc_direct, name)) {
        return null;
    }

    var room_ids = this.mxc_direct[name];
    if (room_ids.length === 0) {
        return null;
    }

    for (var i = 0; i < room_ids.length; ++i) {
        if (mod_jsprim.hasKey(this.mxc_rooms, room_ids[i])) {
            return this.mxc_rooms[room_ids[i]];
        }
    }

    return null;
};

var authConfigSchema = {
    id: 'auth:matrix',
    type: 'object',
    required: [ 'url', 'username' ],
    properties: {
        'url': {
            type: 'string',
            pattern: '^https://'
        },
        'username': {
            type: 'string'
        },
        'token': {
            type: 'string'
        },
        'password': {
            type: 'string'
        }
    }
};

module.exports = {
    Client: MatrixClient,
    authConfigSchema: authConfigSchema
};

