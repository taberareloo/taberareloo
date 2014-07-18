// -*- coding: utf-8 -*-
/*global Deferred:true, maybeDeferred:true*/
(function (exports) {
  'use strict';

  function Command(callback, df) {
    this.callback = callback;
    this.df = df;
  }

  function CommandQueue(interval) {
    this._commands = [];
    this._runId = null;
    this._interval = (interval == null) ? 0 : interval;
  }

  CommandQueue.prototype.push = function (callback) {
    var df = new Deferred();
    this._commands.push(new Command(callback, df));
    this._run();
    return df;
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
      var command, deferred;

      command = that._commands.shift();
      deferred = command.df;
      maybeDeferred(command.callback()).then(
        function (result) {
          deferred.callback(result);
        },
        function (err) {
          deferred.errback(err);
        }
      ).addBoth(next);
    }

    if (that._runId != null) {
      return;
    }

    that._runId = setTimeout(run, that._interval);
  };

  exports.CommandQueue = CommandQueue;
}(this));
