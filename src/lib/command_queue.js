// -*- coding: utf-8 -*-
(function (exports) {
  'use strict';

  function Command(callback, resolve, reject) {
    this.callback = callback;
    this.resolve = resolve;
    this.reject = reject;
  }

  function CommandQueue(interval) {
    this._commands = [];
    this._runId = null;
    this._interval = (interval == null) ? 0 : interval;
  }

  CommandQueue.prototype.push = function (callback) {
    var that = this;
    return new Promise(function (resolve, reject) {
      that._commands.push(new Command(callback, resolve, reject));
      that._run();
    });
  };

  CommandQueue.prototype._run = function () {
    var that = this;

    function next() {
      if (that._commands.length === 0) {
        that._runId = null;
      } else {
        that._runId = setTimeout(run, that._interval);
      }
    }

    function run() {
      var command;

      command = that._commands.shift();
      Promise.resolve(command.callback()).then(command.resolve, command.reject).then(next, next);
    }

    if (that._runId != null) {
      return;
    }

    that._runId = setTimeout(run, that._interval);
  };

  exports.CommandQueue = CommandQueue;
}(this));
