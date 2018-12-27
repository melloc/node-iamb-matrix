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


// --- Internal helpers

function compareById(a, b) {
    var ai = a.id();
    var bi = b.id();

    if (ai < bi) {
        return (-1);
    } else if (ai === bi) {
        return (0);
    } else {
        return (1);
    }
}

function compareByName(a, b) {
    var ai = a.name();
    var bi = b.name();

    if (ai < bi) {
        return (-1);
    } else if (ai === bi) {
        return (0);
    } else {
        return (1);
    }
}

// --- Exports

function MatrixUser(id) {
    this.mxu_id = id;
    this.mxu_updatets = 0;
    this.mxu_nickname = null;
    this.mxu_unode = null;
    this.mxu_nnode = null;
}

MatrixUser.prototype.update = function (event) {
    if (event.origin_server_ts <= this.mxu_updatets) {
        return;
    }

    this.mxu_nickname = event.content.displayname;
};

MatrixUser.prototype.id = function getId() {
    return this.mxu_id;
};

MatrixUser.prototype.getDisplayName = function () {
    if (this.mxu_nickname !== null && this.mxu_nickname.length > 0) {
        return this.mxu_nickname;
    } else {
        return this.mxu_id;
    }
};

function MatrixUserDB(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.client, 'opts.client');

    this.mxu_client = opts.client;
    this.mxu_uids = new mod_taiga.AVLTree({ compare: compareById });
    this.mxu_name = new mod_taiga.AVLTree({ compare: compareByName });

    mod_events.EventEmitter.call(this);
}
mod_util.inherits(MatrixUserDB, mod_events.EventEmitter);

MatrixUserDB.prototype.getUserById = function getUserById(id) {
    assert.string(id, 'id');
    var tmpu = new MatrixUser(id);
    var user = this.mxu_uids.find(tmpu);
    if (user === null) {
        return null;
    }
    return user.value();
};

/*
 * In Matrix, usernames are the same tokens used as identifiers in API
 * request results.
 */
MatrixUserDB.prototype.getUserByName = function getUserByName(name) {
    return this.getUserById(name);
};

MatrixUserDB.prototype.getUser = function getUser(id) {
    var user = this.getUserById(id);
    if (user !== null) {
        return user;
    }

    user = new MatrixUser(id);
    user.mxu_unode = this.mxu_uids.insert(user);

    return user;
};

module.exports = MatrixUserDB;
