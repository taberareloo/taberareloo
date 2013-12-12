// -*- coding: utf-8 -*-
/*global Deferred:true*/
(function (exports) {
  'use strict';

  function Command(callback, df) {
    this.callback = callback;
    this.df = df;
  }

  function CommandQueue(interval) {
    this._commands = [];
    this._runId = null;
    this._interval = (interval == null) ? 1000 : interval;
  }

  CommandQueue.prototype.push = function (callback) {
    var df = new Deferred();
    this._commands.push(new Command(callback, df));
    this._run();
    return df;
  };

  CommandQueue.prototype._run = function () {
    var that = this;

    function run() {
      var command;

      command = that._commands.shift();
      command.callback().addCallbacks(
        function (result) {
          command.df.callback(result);
        },
        function (err) {
          command.df.errback(err);
        }
      );

      // CommandQueue is empty
      if (that._commands.length === 0) {
        that._runId = null;
      } else {
        that._runId = setTimeout(run, that._interval);
      }
    }

    if (that._runId != null) {
      return;
    }

    that._runId = setTimeout(run, that._interval);
  };

  exports.CommandQueue = CommandQueue;
}(this));
