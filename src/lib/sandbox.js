(function () {
  'use strict';

  var globalEval = ('global', eval);

  window.onmessage = function (req) {
    switch (req.data.action) {
    case 'evalJSON':
      var res = {
        seq : req.data.seq
      };
      res.json = globalEval('(' + req.data.value + ')');
      top.postMessage(res, '*');
      break;
    default:
    }
  };
}());
/* vim: set sw=2 ts=2 et tw=80 : */
