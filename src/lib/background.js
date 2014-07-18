// -*- coding: utf-8 -*-
/*global chrome:true, getFileFromEntry:true, Models:true*/
/*global queryString:true, delay:true, errorInformedPromiseAllHash:true*/
/*global createFileEntryFromBlob:true, base64ToBlob:true, getURLFromFile:true, Notification:true*/
/*global download:true, Tumblr:true, Patches:true, request:true*/
(function (exports) {
  'use strict';

  window.addEventListener('load', function () {
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
        {name: 'Taberareloo.quote'}
      ]
    };
    chrome.runtime.sendMessage(CHROME_GESTURES, action, function () {
      REGISTER.CHROME_GESTURES = true;
    });
    chrome.runtime.sendMessage(CHROME_KEYCONFIG, action, function () {
      REGISTER.CHROME_KEYCONFIG = true;
    });
    delay(10).then(function () {
      // ダメ押しのもう一回
      if (!REGISTER.CHROME_GESTURES) {
        chrome.runtime.sendMessage(CHROME_GESTURES, action, function () {
          REGISTER.CHROME_GESTURES = true;
        });
      }
      if (!REGISTER.CHROME_KEYCONFIG) {
        chrome.runtime.sendMessage(CHROME_KEYCONFIG, action, function () {
          REGISTER.CHROME_KEYCONFIG = true;
        });
      }
    });
  }, false);

  // trap background ps construct
  function constructPsInBackground(content) {
    if (content.fileEntry) {
      var entry = GlobalFileEntryCache[content.fileEntry];
      return getFileFromEntry(entry).then(function (file) {
        content.file = file;
        return content;
      });
    } else {
      return Promise.resolve(content);
    }
  }

  // this is FileEntry (temp file) cacheing table
  // key: blob url
  // value: FileEntry
  var GlobalFileEntryCache = { };

  var TBRL = exports.TBRL = {
    // default config
    VERSION: chrome.runtime.getManifest().version,
    ID: chrome.runtime.id,
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
        'play_on_tumblr_play': false,
        'play_on_tumblr_like': false,
        'play_on_tumblr_count': false,
        'shortcutkey_ldr_plus_taberareloo': 'T',
        'shortcutkey_dashboard_plus_taberareloo': 'T',
        'shortcutkey_dashboard_plus_taberareloo_manually': 'SHIFT + T',
        'shortcutkey_play_on_tumblr_play': 'RETURN',
        'shortcutkey_play_on_tumblr_like': '',
        'shortcutkey_play_on_tumblr_count': '',
        'keyconfig': true,
        'shortcutkey_linkquickpost': '',
        'shortcutkey_quotequickpost': '',
        'evernote_clip_fullpage': true,
        'remove_hatena_keyword': false,
        'tumblr_default_quote': false,
        'always_shorten_url': false,
        'multi_tumblelogs': false,
        'post_with_queue': false,
        'ignore_canonical': 'twitter\\.com',
        'notification_on_posting': true,
        'check_https': true
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
      post: function (ps, posters) {
        var self = this;
        var ds = {};
        var models = {};
        var notifications = [];
        posters = [].concat(posters);
        posters.forEach(function (p) {
          ds[p.name] = (TBRL.Config.post.notification_on_posting ?
            TBRL.Notification.notify({title: p.name, message: 'Posting...'}) : Promise.resolve(null)
          ).then(function (notification) {
            var promise;

            models[p.name] = p;
            try {
              promise = (ps.favorite && new RegExp('^' + ps.favorite.name + '(\\s|$)').test(p.name)) ? p.favor(ps) : p.post(ps);
            } catch (e) {
              promise = Promise.reject(e);
            }

            if (notification) {
              promise.then(
                function (res) {
                  TBRL.Notification.notify({
                    title: p.name,
                    message: 'Posting... Done',
                    timeout: 3,
                    id: notification.tag
                  }).then(function (n) {
                    if (n) {
                      notifications.push(n);
                    }
                  });
                  return res;
                },
                function (res) {
                  console.error(res);
                  console.error(res.stack);
                  TBRL.Notification.notify({
                    title: p.name,
                    message: 'Posting... Error',
                    id: notification.tag,
                    onclick: function () {
                      window.open(ps.pageUrl, '');
                      this.close();
                    }
                  });
                  return res;
                }
              );
            }

            return promise;
          });
        });

        // Posting core routine.
        return errorInformedPromiseAllHash(ds).then(function (ress) {
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

          if (TBRL.Config.post.notification_on_posting) {
            delay(0.5).then(function () {
              notifications.forEach(function (notification) {
                try {
                  notification.close();
                } catch (e) {}
              });
            });
          }

          if (errs.length) {
            self.alertError(
              chrome.i18n.getMessage(
                'error_post', [errs.join('\n').indent(2), ps.page, ps.pageUrl]),
              ps.pageUrl, urls);
          } else {
            delete TBRL.Popup.contents[ps.https.pageUrl[1]];
          }
        }).catch(function (err) {
          self.alertError(err, ps.pageUrl);
        });
      },
      isEnableSite: function (link) {
        return link.indexOf('http') === 0;
      },
      alertError: function (error, url, logins) {
        var res = window.confirm(
            error + '\n\n' + chrome.i18n.getMessage('error_reopen'));
        if (res) {
          chrome.windows.getAll(null, function (wins) {
            if (wins.length) {
              chrome.tabs.create({
                url: url,
                selected: true
              });
              if (logins.length) {
                logins.uniq().forEach(function (url) {
                  chrome.tabs.create({
                    url: url,
                    selected: false
                  });
                });
              }
            } else {
              chrome.windows.create({
                url: url
              }, function (win) {
                if (logins.length) {
                  logins.uniq().forEach(function (url) {
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
      open: function (tab, ps) {
        var id = 'QuickPost' + (TBRL.Popup.count++);
        var query = queryString({
          'quick': 'true',
          'id': id
        }, true);
        TBRL.Popup.data[id] = {
          'ps': ps,
          'tab': tab
        };
        chrome.windows.get(tab.windowId, function (win) {
          var pos = localStorage.getItem('popup_position');
          if (pos) {
            pos = JSON.parse(pos);
          } else {
            pos = {
              top  : 50,
              left : 50
            };
          }
          if ((/mac/i.test(navigator.platform)) && (win.state === 'fullscreen')) {
            chrome.tabs.create({
              windowId : win.id,
              url      : chrome.runtime.getURL('popup.html') + query
            });
          } else {
            chrome.windows.create({
              url     : chrome.runtime.getURL('popup.html') + query,
              top     : win.top  + pos.top,
              left    : win.left + pos.left,
              width   : 450,
              height  : 200,
              focused : true,
              type    : 'popup'
            });
          }
        });
      },
      defaultSuggester: 'HatenaBookmark',
      tags: null,
      tabs: [],
      data: {},
      contents: {},
      suggestionShownDefault: false
    },
    Notification: {
      ICON: chrome.runtime.getURL('skin/fork64.png'),
      ID: 0,
      contents: {},
      generateUniqueID: function () {
        var id = this.ID++;
        return TBRL.ID + id;
      },
      notify: function (opt) {
        var id = opt.id || this.generateUniqueID();
        var icon = opt.icon || this.ICON;
        var title = opt.title || '';
        var message = opt.message || '';
        var timeout = typeof opt.timeout === 'number' ? opt.timeout * 1000 : null;
        var onclick = opt.onclick || null;
        var onclose = opt.onclose || null;

        if (chrome.notifications) {
          return new Promise(function (resolve) {
            chrome.notifications.create(opt.id || '', {
              type     : opt.image ? 'image' : 'basic',
              title    : title,
              message  : message,
              iconUrl  : icon,
              imageUrl : opt.image || null
            }, function (id) {
              var notification = {
                tag   : id,
                close : function () {
                  chrome.notifications.clear(id, function (wasCleared) {
                    delete TBRL.Notification.contents[id];
                  });
                }
              };
              if (timeout !== null) {
                setTimeout(function () {
                  chrome.notifications.clear(id, function (wasCleared) {
                    delete TBRL.Notification.contents[id];
                  });
                }, timeout);
              }
              if (onclick) {
                notification.onclick = onclick;
              }
              if (onclose) {
                notification.onclose = onclose;
              }
              TBRL.Notification.contents[id] = notification;
              resolve(notification);
            });
          });
        }

        try {
          var notification = new Notification(title, {
            body: message,
            tag: id,
            icon: icon
          });
          if (timeout !== null) {
            notification.onshow = function () {
              setTimeout(function () {
                notification.close();
              }, timeout);
            };
          }
          if (onclick) {
            notification.onclick = onclick;
          }
          if (onclose) {
            notification.onclose = onclose;
          }
          return Promise.resolve(notification);
        } catch (e) {
          return Promise.resolve(null);
        }
      }
    },
    configSet: function (config) {
      TBRL.Config = config;
      window.localStorage.options = JSON.stringify(config);
    },
    configUpdate: function (log) {
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
              Object.keys(val).forEach(function (k) {
                setter(k, val, target[key]);
              });
            }
          }
        }
      }
      Object.keys(log).forEach(function (k) {
        setter(k, log, TBRL.Config);
      });
      TBRL.Config.version = TBRL.VERSION;
    },

    isBackground: function () {
      return true;
    },
    setRequestHandler : function (request, handler) {
      onRequestsHandlers[request] = handler;
    }
  };

  if (chrome.notifications) {
    chrome.notifications.onClicked.addListener(function (id) {
      var n = TBRL.Notification.contents[id];
      if (n && n.onclick) {
        n.onclick();
      }
    });
    chrome.notifications.onClosed.addListener(function (id, byUser) {
      var n = TBRL.Notification.contents[id];
      if (n) {
        if (n.onclose) {
          n.onclose();
        }
        delete TBRL.Notification.contents[id];
      }
    });
  }

  if (window.localStorage.options) {
    TBRL.configUpdate(JSON.parse(window.localStorage.options));
  } else {
    window.localStorage.options = JSON.stringify(TBRL.Config);
  }

  if (TBRL.Config.post.multi_tumblelogs) {
    Models.getMultiTumblelogs(false);
  }
  // HatenaBlog
  if (TBRL.Config.post.enable_hatenablog) {
    Models.getHatenaBlogs();
  }
  // WebHook
  if (TBRL.Config.post.enable_webhook && TBRL.Config.post.webhook_url) {
    Models.addWebHooks();
  }
  Models.initialize();

  var onRequestsHandlers = {
    capture: function (req, sender, func) {
      delay(0.5).then(function () {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format : 'png' }, function (data) {
          func(data);
        });
      });
    },
    base64ToFileEntry: function (req, sender, func) {
      var type = 'image/png';
      var ext  = 'png';
      var m = ('' + req.content).match(/^data:(image\/(\w+))[,;]/);
      if (m) {
        type = m[1];
        ext  = m[2];
      }
      createFileEntryFromBlob(base64ToBlob(req.content, type), ext).then(function (entry) {
        return getFileFromEntry(entry).then(function (file) {
          var key = getURLFromFile(file);
          GlobalFileEntryCache[key] = entry;
          return key;
        }).then(function (url) {
          func(url);
        }, function (e) {
          func(e);
        });
      });
    },
    share: function (req, sender, func) {
      constructPsInBackground(req.content).then(function (ps) {
        if (req.show) {
          TBRL.Popup.open(sender.tab, ps);
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
    },
    config: function (req, sender, func) {
      func(TBRL.Config);
    },
    log: function (req, sender, func) {
      console.log.apply(console, req.content);
      func(req.content);
    },
    download: function (req, sender, func) {
      var content = req.content,
          opt = content.opt,
          url = content.url;
      // this is very experimental
      return download(url, opt && opt.ext).then(function (entry) {
        return getFileFromEntry(entry).then(function (file) {
          var key = getURLFromFile(file);
          GlobalFileEntryCache[key] = entry;
          return key;
        }).then(function (url) {
          func({
            success: true,
            content: url
          });
        }, function (e) {
          func({
            success: false,
            content: e
          });
        });
      });
    },
    notifications: function (req, sender, func) {
      var id = req.content;
      func(TBRL.Notification.contents[id]);
    },
    initialize: function () {
      Models.initialize();
    },
    getCachedTumblrInfo: function (req, sender, func) {
      function sendInfo() {
        func({
          form_key: Tumblr.form_key,
          channel_id: Tumblr.channel_id
        });
      }

      if (Tumblr.form_key && Tumblr.channel_id && !req.cacheClear) {
        sendInfo();
      } else {
        if (req.cacheClear) {
          Tumblr.form_key = Tumblr.channel_id = null;
        }

        Tumblr.getForm(Tumblr.TUMBLR_URL + 'new/text').then(sendInfo);
      }
    },
    loadPatchesInContent: function (req, sender) {
      if (req.visibility !== 'prerender') { // if (sender.tab.index !== -1) {
        Patches.loadInTab(sender.tab);
      }
    }
  };

  chrome.tabs.onReplaced.addListener(function (new_tab_id, old_tab_id) {
    chrome.tabs.get(new_tab_id, function (tab) {
      if (tab.index !== -1) {
        Patches.loadInTab(tab);
      }
    });
  });

  chrome.runtime.onMessage.addListener(function (req) {
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
   * @return {Promise} リダイレクト先のURLが返される リダイレイクトしない場合はもとのURL
   */
  exports.getFinalUrl = (function () {
    if (!chrome.webRequest) {
      return null;
    }

    var redirects = {};
    var threads = 0;

    // リダイレクトを記録しておく
    chrome.webRequest.onBeforeRedirect.addListener(function (detail) {
      redirects[detail.url] = detail.redirectUrl;
    }, {
      urls: [
        'http://*/*',
        'https://*/*',
      ],
    }, []);

    // 暇そうなときにキャッシュ削除
    // 10 minutes
    delay(60 * 10).then(function () {
      if (threads === 0) {
        redirects = {};
      }
    });

    return function getFinalUrl(url) {
      return new Promise(function (resolve) {
        // キャッシュにあればすぐに返す
        if (redirects[url]) {
          resolve(redirects[url]);
          return;
        }

        // URLにリクエスト送って調べる
        function handler() {
          threads--;
          if (redirects[url]) {
            resolve(redirects[url]);
          } else {
            resolve(url);
          }
        }
        threads++;
        request(url, { method: 'HEAD' }).then(handler, handler);
      });
    };
  })();

  var Sandbox = exports.Sandbox = {
    sandbox  : null,
    sequence : 0,

    initailize : function () {
      this.sandbox = document.createElement('iframe');
      this.sandbox.src = 'sandbox.html';
      document.body.appendChild(this.sandbox);
    },

    evalJSON : function (str) {
      var that = this;
      return new Promise(function (resolve) {
        var seq = that.sequence++;
        var messageHandler = function (res) {
          if (res.data.seq === seq) {
            window.removeEventListener('message', messageHandler);
            resolve(res.data.json);
          }
        };
        window.addEventListener('message', messageHandler, false);
        that.sandbox.contentWindow.postMessage({
          action : 'evalJSON',
          seq    : seq,
          value  : str
        }, '*');
      });
    }
  };
  Sandbox.initailize();
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
