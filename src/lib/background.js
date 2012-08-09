// -*- coding: utf-8 -*-

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
  chrome.extension.sendMessage(CHROME_GESTURES, action, function(res) {
    REGISTER['CHROME_GESTURES'] = true;
  });
  chrome.extension.sendMessage(CHROME_KEYCONFIG, action, function(res) {
    REGISTER['CHROME_KEYCONFIG'] = true;
  });
  setTimeout(function() {
    // ダメ押しのもう一回
    if (!REGISTER['CHROME_GESTURES']) {
      chrome.extension.sendMessage(CHROME_GESTURES, action, function(res) {
        REGISTER['CHROME_GESTURES'] = true;
      });
    }
    if (!REGISTER['CHROME_KEYCONFIG']) {
      chrome.extension.sendMessage(CHROME_KEYCONFIG, action, function(res) {
        REGISTER['CHROME_KEYCONFIG'] = true;
      });
    }
  }, 1000 * 10);
}, false);

// trap background ps construct
function constructPsInBackground(content) {
  if (content.fileEntry) {
    var entry = GlobalFileEntryCache[content.fileEntry];
    return getFileFromEntry(entry).addCallback(function(file) {
      content.file = file;
      return content;
    });
  } else {
    return succeed(content);
  }
}

function getCurrent() {
  var d = new Deferred();
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    d.callback(tabs[0]);
  });
  return d;
}

// this is FileEntry (temp file) cacheing table
// key: blob url
// value: FileEntry
var GlobalFileEntryCache = { };

var TBRL = {
  // default config
  VERSION: chrome.app.getDetails().version,
  ID: chrome.app.getDetails().id,
  Config: {
    'services': {
    },
    'post': {
      'tag_provider': 'HatenaBookmark',
      'tag_auto_complete': true,
      'ldr_plus_taberareloo': false,
      'disable_tumblr_default_keybind': false,
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
      'post_with_queue': false,
      'ignore_canonical': 'twitter\\.com',
      'notification_on_posting': true
    },
    'entry': {
      'trim_reblog_info': false,
      'append_content_source': true,
      'not_convert_text': true,
      'thumbnail_template': '',
      'twitter_template': ''
    },
    'model': {
      'delicious': {
        'prematureSave': false
      }
    }
  },
  Service: {
    post: function(ps, posters) {
      var self = this;
      var ds = {};
      var models = {};
      var notifications = [];
      posters = [].concat(posters);
      posters.forEach(function(p) {
        var notification = null;

        if (TBRL.Config.post['notification_on_posting']) {
          notification = TBRL.Notification.notify({
            title: p.name,
            message: 'Posting...'
          });
        }

        models[p.name] = p;
        try {
          ds[p.name] =
        (ps.favorite &&
         RegExp('^' + ps.favorite.name + '(\\s|$)').test(p.name)) ?
            p.favor(ps) : p.post(ps);
        } catch (e) {
          ds[p.name] = fail(e);
        }

        if (TBRL.Config.post['notification_on_posting']) {
          ds[p.name].addCallbacks(
            function(res) {
              var n = TBRL.Notification.notify({
                title: p.name,
                message: 'Posting... Done',
                timeout: 3,
                id: notification.replaceId
              });
              if (n) {
                notifications.push(n);
              }
              return res;
            },
            function(res) {
              TBRL.Notification.notify({
                title: p.name,
                message: 'Posting... Error',
                id: notification.replaceId,
                onclick: function () {
                  window.open(ps.pageUrl, '');
                  this.cancel();
                }
              });
              return res;
            }
          );
        }
      });
      return new DeferredHash(ds).addCallback(function(ress) {
        var errs = [], urls = [];
        for (var name in ress) {
          var success = ress[name][0], res = ress[name][1];
          if (!success) {
            var msg = name + ': ' +
              (res.message.hasOwnProperty('status') ?
               '\n' + ('HTTP Status Code ' + res.message.status).indent(4) :
               '\n' + res.message.indent(4));
            errs.push(msg);
            urls.push(models[name].LOGIN_URL);
          }
        }

        if (TBRL.Config.post['notification_on_posting']) {
          setTimeout(function () {
            notifications.forEach(function(notification) {
              try {
                notification.cancel();
              } catch (e) {}
            });
          }, 500);
        }

        if (errs.length) {
          self.alertError(
            chrome.i18n.getMessage(
              'error_post', [errs.join('\n').indent(2), ps.page, ps.pageUrl]),
            ps.pageUrl, urls);
        } else {
          delete TBRL.Popup.contents[ps.https.pageUrl[1]];
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
    ICON: chrome.extension.getURL('skin/fork64.png'),
    NOTIFIER: window.webkitNotifications || window.Notifications,
    ID: 0,
    contents: {},
    generateUniqueID: function() {
      var id = this.ID++;
      return TBRL.ID + id;
    },
    notify: function(opt) {
      var id = opt.id || this.generateUniqueID();
      var icon = opt.icon || this.ICON;
      var title = opt.title || '';
      var message = opt.message || '';
      var timeout = typeof opt.timeout === 'number' ? opt.timeout * 1000 : null;
      var onclick = opt.onclick || null;
      try {
        var notification = this.NOTIFIER.createNotification(icon, title, message);
        notification.replaceId = id;
        if (timeout !== null) {
          notification.ondisplay = function () {
            setTimeout(function () {
              notification.cancel();
            }, timeout);
          };
        }
        if (onclick) {
          notification.onclick = onclick;
        }
        notification.show();
        return notification;
      }
      catch(e) {
        return null;
      }
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
// Google+ Pages
if (TBRL.Config.post['enable_google_plus_pages']) {
  Models.getGooglePlusPages();
}
// WebHook
if (TBRL.Config.post['enable_webhook'] && TBRL.Config.post['webhook_url']) {
  Models.addWebHooks();
}
Models.initialize();

var onRequestsHandlers = {
  capture: function(req, sender, func) {
    callLater(0.5, function() {
      chrome.tabs.captureVisibleTab(sender.tab.windowId, function(data) {
        func(data);
      });
    });
  },
  base64ToFileEntry: function(req, sender, func) {
    createFileEntryFromBlob(base64ToBlob(req.content, 'image/png'), 'png').addCallback(function(entry) {
      return getFileFromEntry(entry).addCallback(function(file) {
        var key = getURLFromFile(file);
        GlobalFileEntryCache[key] = entry;
        return key;
      }).addCallbacks(function(url) {
        func(url);
      }, function(e) {
        func(e);
      });
    });
  },
  share: function(req, sender, func) {
    getCurrent().addCallback(function(tab) {
      constructPsInBackground(req.content).addCallback(function(ps) {
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
      });
      func({});
    }).addErrback(function(e) {
    });
  },
  search: function(req, sender, func) {
    // currently, used for GoogleImageSearch
    func({});
    var ps = req.content;
    if (Models.GoogleImage.checkSearch(ps)) {
      Models.GoogleImage.search(ps);
    }
  },
  config: function(req, sender, func) {
    func(TBRL.Config);
  },
  log: function(req, sender, func) {
    console.log.apply(console, req.content);
    func(req.content);
  },
  download: function(req, sender, func) {
    var content = req.content,
        opt = content.opt,
        url = content.url;
    // this is very experimental
    return download(url, opt && opt.ext).addCallback(function(entry) {
      return getFileFromEntry(entry).addCallback(function(file) {
        var key = getURLFromFile(file);
        GlobalFileEntryCache[key] = entry;
        return key;
      }).addCallbacks(function(url) {
        func({
          success: true,
          content: url
        });
      }, function(e) {
        func({
          success: false,
          content: e
        });
      });
    });
  },
  notifications: function(req, sender, func) {
    var id = req.content;
    func(TBRL.Notification.contents[id]);
  },
  initialize: function(req, sender, func) {
    Models.initialize();
  }
};

chrome.extension.onMessage.addListener(function(req, sender, func) {
  var handler = onRequestsHandlers[req.request];
  if (handler) {
    handler.apply(this, arguments);
    return true;
  }
});

/**
 * URLのリダイレクト先を取得する
 *
 * @param {String} url
 * @return {Deferred} リダイレクト先のURLが返される リダイレイクトしない場合はもとのURL
 */
var getFinalUrl = (function() {
  if (!chrome.webRequest) {
    return null;
  }

  var redirects = {};
  var threads = 0;

  // リダイレクトを記録しておく
  chrome.webRequest.onBeforeRedirect.addListener(function(detail) {
    redirects[detail.url] = detail.redirectUrl;
  }, {
    urls: [
      "http://*/*",
      "https://*/*",
    ],
  }, []);

  // 暇そうなときにキャッシュ削除
  // 10 minutes
  setInterval(function() {
    if (threads == 0) {
      redirects = {};
    }
  }, 60 * 1000 * 10);

  return function getFinalUrl(url) {
    var self = this;
    var ret = new Deferred();

    // キャッシュにあればすぐに返す
    if (redirects[url]) {
      setTimeout(function() {
        ret.callback(redirects[url]);
      }, 0, {});
      return ret;
    }

    // URLにリクエスト送って調べる
    threads++;
    request(url, {
      method: 'HEAD'
    }).addBoth(function() {
      threads--;
      if (redirects[url]) {
        ret.callback(redirects[url]);
      } else {
        ret.callback(url);
      }
    });
    return ret;
  };
})();

var Sandbox = {
  sandbox  : null,
  sequence : 0,

  initailize : function() {
    this.sandbox = document.createElement('iframe');
    this.sandbox.sandbox = 'allow-scripts';
    this.sandbox.src = 'sandbox.html';
    document.body.appendChild(this.sandbox);
  },

  evalJSON : function(str) {
    var ret = new Deferred();
    var seq = this.sequence++;
    var messageHandler = function(res) {
      if (res.data.seq === seq) {
        window.removeEventListener('message', messageHandler);
        ret.callback(res.data.json);
      }
    };
    window.addEventListener('message', messageHandler, false);
    this.sandbox.contentWindow.postMessage({
      action : 'evalJSON',
      seq    : seq,
      value  : str
    }, '*');
    return ret;
  }
};
Sandbox.initailize();