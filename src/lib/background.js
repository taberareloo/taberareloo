// -*- coding: utf-8 -*-

function backgroundAlert(message) {
  alert(message);
}

function backgroundConfirm(message) {
  return confirm(message);
}

function backgroundError(message, url) {
  if (confirm(message)) {
    chrome.tabs.getSelected(null, function(tab) {
      chrome.tabs.create({
        index: tab.index + 1,
        url: url,
        selected: true
      });
    });
  }
}

function addTab(url, focus) {
  chrome.tabs.create({
    url: url,
    selected: focus
  });
}

window.addEventListener('load', function() {
  var CHROME_GESTURES = 'jpkfjicglakibpenojifdiepckckakgk';
  var CHROME_KEYCONFIG = 'okneonigbfnolfkmfgjmaeniipdjkgkl';
  var REGISTER = {
    'CHROME_GESTURES' : false,
    'CHROME_KEYCONFIG': false
  };
  var action = {
    group: 'Taberareloo',
    actions: [
      {name: 'Taberareloo.link'},
      {name: 'Taberareloo.quote'},
      {name: 'Taberareloo.general'}
    ]
  };
  chrome.extension.sendRequest(CHROME_GESTURES, action, function(res) {
    REGISTER['CHROME_GESTURES'] = true;
  });
  chrome.extension.sendRequest(CHROME_KEYCONFIG, action, function(res) {
    REGISTER['CHROME_KEYCONFIG'] = true;
  });
  setTimeout(function() {
    // ダメ押しのもう一回
    if (!REGISTER['CHROME_GESTURES']) {
      chrome.extension.sendRequest(CHROME_GESTURES, action, function(res) {
        REGISTER['CHROME_GESTURES'] = true;
      });
    }
    if (!REGISTER['CHROME_KEYCONFIG']) {
      chrome.extension.sendRequest(CHROME_KEYCONFIG, action, function(res) {
        REGISTER['CHROME_KEYCONFIG'] = true;
      });
    }
  }, 1000 * 10);
}, false);

function post_handler(item, con) {
  var ps = item.ps;
  var id = item.id;
  win = open(
      chrome.extension.getURL('quickpostform.html'),
      '_blank',
      'alwaysRaised=yes,toolbar=no,directories=no,status=no,menubar=no,scrollbars=no,location=no,dependent=yes,z-lock=yes');
  win.QuickPostForm = {};
  win.ps = ps;
  win.Models = Models;
}

function binaryRequest(url, opt) {
  return request(url, update({
    charset: 'text/plain; charset=x-user-defined'
  }, opt)).addCallback(function(res) {
    res.responseText = res.responseText.replace(
      /[\u0100-\uffff]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) & 0xff);
    });
    return res;
  });
}

// 2回requestすることでcharset判別する.
function encodedRequest(url, opt) {
  return binaryRequest(url, opt).addCallback(function(res) {
    var binary = res.responseText;
    var charset = null;
    var header = res.getResponseHeader('Content-Type');
    if (header) {
      charset = getCharset(header);
    }
    if (!charset) {
      charset = getEncoding(binary);
      if (!charset) {
        charset = 'utf-8';
      }
    }
    return request(url, update({
      charset: 'text/html; charset=' + charset
    }, opt));
  });
}

// canvas request
function canvasRequest(url) {
  var canvas = document.createElement('canvas'),
      ret = new Deferred(),
      img = new Image();
  img.addEventListener('load', function img_load(res) {
    img.removeEventListener('load', img_load, false);
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ret.callback({
      contentType: 'image/png',
      base64: true,
      height: img.naturalHeight,
      width: img.naturalWidth,
      binary: canvas.toDataURL('image/png', '')
    });
  }, false);
  img.src = url;
  return ret;
}

function getEncoding(text) {
  var matched = text.match(
      /<meta.+?http-equiv.+?Content-Type.+?content=(["'])([^\1]+?)\1/i);
  var res = (matched && !matched[2].match(/UTF-8/i) && matched[2]);
  return (res) ? getCharset(res) : false;
}

function getCharset(text) {
  var matched = text.match(/charset\s*=\s*(\S+)/);
  return (matched && !matched[1].match(/UTF-8/i) && matched[1]);
}

function request_v2(url, opt) {
  var req = new XMLHttpRequest(), ret = new Deferred();

  opt = (opt) ? update({}, opt) : {};
  var method = opt.method && opt.method.toUpperCase();

  if (opt.queryString) {
    var qs = queryString(opt.queryString, true);
    url += qs;
  }

  if (opt.sendContent && (!method || method === 'POST')) {
    if (!method) {
      method = 'POST';
    }
    opt.sendContent = queryString(opt.sendContent, false);
  }
  if (!method) {
    method = 'GET';
  }

  if ('username' in opt) {
    req.open(method, url, true, opt.username, opt.password);
  } else {
    req.open(method, url, true);
  }

  if (opt.charset) {
    req.overrideMimeType(opt.charset);
  }

  var setHeader = true;
  if (opt.headers) {
    if (opt.headers['Content-Type']) {
      setHeader = false;
    }
    Object.keys(opt.headers).forEach(function(key) {
      req.setRequestHeader(key, opt.headers[key]);
    });
  }
  if (setHeader && opt.sendContent) {
    req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  }

  var position = -1;
  var error = false;

  req.onprogress = function(e) {
    position = e.position;
  }
  req.onreadystatechange = function(e) {
    if (req.readyState === 4) {
      var length = 0;
      try {
        length = parseInt(req.getResponseHeader('Content-Length'), 10);
      } catch (e) {
        console.log('ERROR', e);
      }
      // 最終時のlengthと比較
      if (position !== length) {
        if (opt.denyRedirection) {
          ret.errback(req);
          error = true;
        }
      }
      if (!error) {
        if (req.status >= 200 && req.status < 300) {
          ret.callback(req);
        } else {
          req.message = chrome.i18n.getMessage('error_http' + req.status);
          ret.errback(req);
        }
      }
    }
  }
  req.send(opt.sendContent);
  return ret;
}

function request(url, opt) {
  var req = new XMLHttpRequest(), ret = new Deferred();

  opt = (opt) ? update({}, opt) : {};
  var method = opt.method && opt.method.toUpperCase();

  if (opt.queryString) {
    var qs = queryString(opt.queryString, true);
    url += qs;
  }

  if (opt.sendContent && (!method || method === 'POST')) {
    if (!method) {
      method = 'POST';
    }
    opt.sendContent = queryString(opt.sendContent, false);
  }
  if (!method) {
    method = 'GET';
  }

  if ('username' in opt) {
    req.open(method, url, true, opt.username, opt.password);
  } else {
    req.open(method, url, true);
  }

  if (opt.charset) {
    req.overrideMimeType(opt.charset);
  }

  var setHeader = true;
  if (opt.headers) {
    if (opt.headers['Content-Type']) {
      setHeader = false;
    }
    Object.keys(opt.headers).forEach(function(key) {
      req.setRequestHeader(key, opt.headers[key]);
    });
  }
  if (setHeader && opt.sendContent) {
    req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  }

  var position = -1;
  var error = false;

  req.onprogress = function(e) {
    position = e.position;
  }
  req.onreadystatechange = function(e) {
    if (req.readyState === 4) {
      var length = 0;
      try {
        length = parseInt(req.getResponseHeader('Content-Length'), 10);
      } catch (e) {
        console.log('ERROR', e);
      }
      // 最終時のlengthと比較
      if (position !== length) {
        if (opt.denyRedirection) {
          ret.errback(req);
          error = true;
        }
      }
      if (!error) {
        if (req.status >= 200 && req.status < 300) {
          ret.callback(req);
        } else {
          req.message = chrome.i18n.getMessage('error_http' + req.status);
          ret.errback(req);
        }
      }
    }
  }
  req.send(opt.sendContent);
  return ret;
}

function getSelected() {
  var d = new Deferred();
  chrome.tabs.getSelected(null, function(tab) {
    d.callback(tab);
  });
  return d;
}

var TBRL = {
  // default config
  VERSION: '2.0.11',
  ID: chrome.extension.getURL('').match(/chrome-extension:\/\/([^\/]+)\//)[1],
  Config: {
    'services': {
    },
    'post': {
      'tag_provider': 'HatenaBookmark',
      'tag_auto_complete': true,
      'ldr_plus_taberareloo': false,
      'dashboard_plus_taberareloo': false,
      'dashboard_plus_taberareloo_manually': false,
      'googlereader_plus_taberareloo': false,
      'play_on_tumblr_play': false,
      'play_on_tumblr_like': false,
      'play_on_tumblr_count': false,
      'shortcutkey_ldr_plus_taberareloo': 'T',
      'shortcutkey_dashboard_plus_taberareloo': 'T',
      'shortcutkey_dashboard_plus_taberareloo_manually': 'SHIFT + T',
      'shortcutkey_googlereader_plus_taberareloo': 'SHIFT + T',
      'shortcutkey_play_on_tumblr_play': 'RETURN',
      'shortcutkey_play_on_tumblr_like': '',
      'shortcutkey_play_on_tumblr_count': '',
      'keyconfig': true,
      'shortcutkey_linkquickpost': '',
      'shortcutkey_quotequickpost': '',
      'shortcutkey_quickpost': '',
      'evernote_clip_fullpage': true,
      'remove_hatena_keyword': false,
      'tumblr_default_quote': false,
      'always_shorten_url': false,
      'multi_tumblelogs': false,
      'post_with_queue': false
    },
    'entry': {
      'trim_reblog_info': false,
      'append_content_source': true,
      'not_convert_text': true,
      'thumbnail_template': '',
      'twitter_template': ''
    }
  },
  Service: {
    post: function(ps, posters) {
      var self = this;
      var ds = {};
      var models = {};
      posters = [].concat(posters);
      posters.forEach(function(p) {
        models[p.name] = p;
        try {
          ds[p.name] =
        (ps.favorite &&
         RegExp('^' + ps.favorite.name + '(\\s|$)').test(p.name)) ?
            p.favor(ps) : p.post(ps);
        } catch (e) {
          ds[p.name] = fail(e);
        }
      });
      return new DeferredHash(ds).addCallback(function(ress) {
        var errs = [], urls = [];
        for (var name in ress) {
          var success = ress[name][0], res = ress[name][1];
          if (!success) {
            var msg = name + ': ' +
              (res.message.status ?
               '\n' + ('HTTP Status Code ' + res.message.status).indent(4) :
               '\n' + res.message.indent(4));
            errs.push(msg);
            urls.push(models[name].LOGIN_URL);
          }
        }
        if (errs.length) {
          self.alertError(
            chrome.i18n.getMessage(
              'error_post', [errs.join('\n').indent(2), ps.page, ps.pageUrl]),
            ps.pageUrl, urls);
        } else {
          delete TBRL.Popup.contents[ps.itemUrl];
        }
      }).addErrback(function(err) {
        self.alertError(err, ps.pageUrl);
      });
    },
    isEnableSite: function(link) {
      return link.indexOf('http') === 0;
    },
    alertError: function(error, url, logins) {
      var res = confirm(
          error + '\n\n' + chrome.i18n.getMessage('error_reopen'));
      if (res) {
        chrome.windows.getAll(null, function(wins) {
          if (wins.length) {
            chrome.tabs.create({
              url: url,
              selected: true
            });
            if (logins.length) {
              logins.uniq().forEach(function(url) {
                chrome.tabs.create({
                  url: url,
                  selected: false
                });
              });
            }
          } else {
            chrome.windows.create({
              url: url
            }, function(win) {
              if (logins.length) {
                logins.uniq().forEach(function(url) {
                  chrome.tabs.create({
                    windowId: win.id,
                    url: url,
                    selected: false
                  });
                });
              }
            });
          }
        });
      }
    }
  },
  Popup: {
    count: 0,
    open: function(tab, ps) {
      var height = 'height=200';
      var id = 'QuickPost' + (TBRL.Popup.count++);
      var query = queryString({
        'quick': 'true',
        'id': id
      }, true);
      TBRL.Popup.data[id] = {
        'ps': ps,
        'tab': tab
      };
      window.open(
          chrome.extension.getURL('popup.html') + query,
          id,
          height +
          ',width=450,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no');
    },
    defaultSuggester: 'HatenaBookmark',
    tags: null,
    tabs: [],
    data: {},
    contents: {},
    suggestionShownDefault: false
  },
  Notification: {
    contents: {},
    id: 0,
    notify: function(content) {
      var notify = TBRL.Notification;
      var id = ++notify.id;
      notify.contents[id] = content;
      var query = queryString({
        'id': id
      }, true);
      var note = webkitNotifications.createHTMLNotification(
          chrome.extension.getURL('notifications.html') + query);
      note.show();
    }
  },
  configSet: function(config) {
    TBRL.Config = config;
    window.localStorage.options = JSON.stringify(config);
  },
  configUpdate: function(log) {
    function setter(key, def, target) {
      var val = def[key];
      var res = typeof(val);
      if (Array.isArray(val)) {
        if (!(target[key])) {
          target[key] = [];
        }
        for (var i = 0, l = val.length; i < l; ++i) {
          setter(i, val, target[key]);
        }
      } else {
        switch (res) {
          case 'string':
          case 'number':
          case 'function':
          case 'boolean':
            target[key] = val;
            break;
          default:
            if (val instanceof Date ||
                val instanceof RegExp ||
                val instanceof String ||
                val instanceof Number ||
                val === null) {
              target[key] = val;
            } else {
              if (!(target[key])) {
                target[key] = {};
              }
              Object.keys(val).forEach(function(k) {
                setter(k, val, target[key]);
              });
            }
        }
      }
    }
    Object.keys(log).forEach(function(k) {
      setter(k, log, TBRL.Config);
    });
    TBRL.Config.version = TBRL.VERSION;
  }
};

if (window.localStorage.options) {
  TBRL.configUpdate(JSON.parse(window.localStorage.options));
} else {
  window.localStorage.options = JSON.stringify(TBRL.Config);
}

if (TBRL.Config.post['multi_tumblelogs']) {
  Models.getMultiTumblelogs();
}

var onRequestsHandlers = {
  capture: function(req, sender, func) {
    callLater(0.5, function() {
      chrome.tabs.captureVisibleTab(sender.tab.windowId, function(data) {
        func(data);
      });
    });
  },
  share: function(req, sender, func) {
    getSelected().addCallback(function(tab) {
      var ps = req.content;
      if (req.show) {
        TBRL.Popup.open(tab, ps);
      } else {
        var posters = Models.getDefaults(ps);
        if (!posters.length) {
          alert(chrome.i18n.getMessage('error_noPoster', ps.type.capitalize()));
        } else {
          TBRL.Service.post(ps, posters);
        }
      }
      func({});
    }).addErrback(function(e) {
    });
  },
  config: function(req, sender, func) {
    func(TBRL.Config);
  },
  log: function(req, sender, func) {
    console.log.apply(console, req.content);
    func(req.content);
  },
  request: function(req, sender, func) {
    var content = req.content,
        opt = content.opt,
        url = content.url;
    return request(url, opt).addCallbacks(function(res) {
      func({
        success: true,
        content: res
      });
    }, function(res) {
      func({
        success: false,
        content: res
      });
    });
  },
  notifications: function(req, sender, func) {
    var id = req.content;
    func(TBRL.Notification.contents[id]);
  }
};

chrome.extension.onRequest.addListener(function(req, sender, func) {
  var handler = onRequestsHandlers[req.request];
  handler && handler.apply(this, arguments);
});

(function() {
  var id = chrome.contextMenus.create({
    title: 'Share ...',
    contexts: ['all']
  });
  chrome.contextMenus.create({
    title: 'Taberareloo',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenus',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Quote',
    contexts: ['selection'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusQuote',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Link',
    contexts: ['link'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusLink',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo',
    contexts: ['image'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusImage',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Video',
    contexts: ['video'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusVideo',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Audio',
    contexts: ['audio'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusAudio',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Photo - Capture',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusCapture',
        content: info
      });
    }
  });
  chrome.contextMenus.create({
    title: 'Text',
    contexts: ['all'],
    parentId: id,
    onclick: function(info, tab) {
      chrome.tabs.sendRequest(tab.id, {
        request: 'contextMenusText',
        content: info
      });
    }
  });
})();
