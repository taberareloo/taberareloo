/* -*- coding: utf-8 -*- */
/* like tombloo Repository */
/*global $A:true */
(function (exports) {
  'use strict';

  function Repository() {
    this.list = [];
  }

  Repository.prototype = {
    constructor: Repository,
    clear : function () {
      this.names.forEach(function (name) {
        delete this[name];
      }, this);
      this.list = [];
    },
    find : function (name) {
      return this.values.filter(function (i) {
        return !!~i.name.search(name);
      });
    },
    remove: function (model) {
      var list = this.list, compare = null, name;
      if (typeof(model) === 'string') {
        name = model;
        compare = function (m) {
          return m.name === model;
        };
      } else {
        name = model.name;
        compare = function (m) {
          return m === model;
        };
      }
      for (var i = 0, len = this.list.length; i < len; ++i) {
        if (compare(list[i])) {
          list.splice(i, 1);
          break;
        }
      }
      if (name) {
        delete this[name];
      }
    },
    copyTo : function (t) {
      t.list = $A(this.list);
      t.list.forEach(function (def) {
        t[def.name] = def;
      });
      return t;
    },
    check : function () {
      var args = $A(arguments);
      return this.values.reduce(function (memo, i) {
        if (i.check && i.check.apply(i, args)) {
          memo.push(i);
        }
        return memo;
      }, []);
    },
    register : function (defs, target, after) {
      if (!defs) {
        return;
      }
      defs = [].concat(defs);
      defs.forEach(function (d) {
        if (this.hasOwnProperty(d.name)) {
          this.remove(this[d.name]);
        }
      }, this);
      if (target) {
        var vals = this.values;
        this.clear();
        for (var i = 0, len = vals.length; i < len; ++i) {
          if (vals[i].name === target) {
            break;
          }
        }
        vals.splice.apply(vals, [(after ? i + 1 : i), 0].concat(defs));
        defs = vals;
      }
      defs.forEach(function (d) {
        this.list.push(d);
        this[d.name] = d;
      }, this);
    },
    initialize: function () {
      var args = Array.prototype.slice.call(arguments);
      this.values.forEach(function (i) {
        if (i.initialize) {
          i.initialize.apply(i, args);
        }
      });
    },
    get values() {
      return this.list.filter(function (i) { return i.name; });
    },
    get names() {
      return this.values.map(function (value) { return value.name; });
    },
    get size() {
      return this.values.length;
    }
  };

  exports.Repository = Repository;
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
