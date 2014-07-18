// -*- coding: utf-8 -*-
// content script space
/*jshint scripturl:true*/
/*global chrome:true, UserScripts:true, Extractors:true*/
/*global $N:true, $X:true, tagName:true*/
/*global keyString:true, createFlavoredString:true, update:true, url:true*/
/*global checkHttps:true, $A:true*/
(function (exports) {
  'use strict';

  var TBRL = {
    clickTarget: { x: 0, y: 0 },
    config : null,
    id     : chrome.runtime.id,
    ldr_plus_taberareloo : false,
    init : function (config) {
      var userscripts;

      TBRL.config = config;
      document.addEventListener('mousedown', TBRL.clickhandler, false);
      document.addEventListener('unload', TBRL.unload, false);
      window.addEventListener('Taberareloo.link', TBRL.link, false);
      window.addEventListener('Taberareloo.quote', TBRL.quote, false);

      if (!TBRL.config.post.keyconfig) {
        document.addEventListener('keydown', TBRL.keyhandler, false);
      }

      userscripts = TBRL.userscripts = UserScripts.check();
      userscripts.forEach(function (script) {
        script.exec();
      });
    },
    unload : function () {
      document.removeEventListener('unload', TBRL.unload, false);

      if (!TBRL.config.post.keyconfig) {
        document.removeEventListener('keydown', TBRL.keyhandler, false);
      }

      document.removeEventListener('mousedown', TBRL.clickhandler, false);
      window.removeEventListener('Taberareloo.link', TBRL.link, false);
      window.removeEventListener('Taberareloo.quote', TBRL.quote, false);

      TBRL.userscripts.forEach(function (script) {
        script.unload();
      });
    },
    link : function () {
      var ctx = TBRL.createContext(document.documentElement);
      var ext = Extractors.check(ctx).filter(function (m) {
        return (/^Link/).test(m.name);
      })[0];
      return TBRL.share(ctx, ext, true);
    },
    quote: function () {
      var ctx = TBRL.createContext();
      var ext = (Extractors.Quote.check(ctx)) ? Extractors.Quote : Extractors.Text;
      return TBRL.share(ctx, ext, true);
    },
    keyhandler: function (ev) {
      var t = ev.target;
      if (t.nodeType === 1) {
        try {
          var tag = tagName(t);

          if (tag === 'input' || tag === 'textarea') {
            return;
          }

          var key = keyString(ev);
          var link_quick_post = TBRL.config.post.shortcutkey_linkquickpost;
          var quote_quick_post = TBRL.config.post.shortcutkey_quotequickpost;

          if (link_quick_post && key === link_quick_post) {
            TBRL.link();
          } else if (quote_quick_post && key === quote_quick_post) {
            TBRL.quote();
          }
        } catch (e) {
          window.alert(e);
        }
      }
    },
    createContext: function (target) {
      var sel = createFlavoredString(window.getSelection());
      var ctx = update({
        document: document,
        window: window,
        title: document.title || location.href.replace(new RegExp('(?:^http://)?(' + location.hostname + ')(?:/$)?'), '$1'),
        selection: (sel.raw) ? sel : null,
        target: target || document.documentElement
      }, window.location);
      if (ctx.target) {
        ctx.link    = $X('./ancestor-or-self::a[@href]', ctx.target)[0];
        ctx.onLink  = !!ctx.link;
        ctx.onImage = ctx.target instanceof HTMLImageElement;
      }
      return ctx;
    },
    clickhandler: function (ev) {
      TBRL.clickTarget.x = ev.clientX;
      TBRL.clickTarget.y = ev.clientY;
    },
    getContextMenuTarget: function () {
      return document.elementFromPoint(TBRL.clickTarget.x, TBRL.clickTarget.y);
    },
    cleanUpContext: function (ctx) {
      var canonical = $X('//link[@rel="canonical"]/@href', ctx.document)[0];
      if (canonical && !new RegExp(TBRL.config.post.ignore_canonical).test(ctx.href)) {
        ctx.href = url.resolve(ctx.href, canonical);
      }
      if (Extractors['Quote - Twitter'].check(ctx)) {
        ctx.href = ctx.href.replace(/\/#!\//, '/');
      }
      return ctx;
    },
    extract: function (ctx, ext) {
      this.cleanUpContext(ctx);
      return Promise.resolve(ext.extract(ctx)).then(function (ps) {
        if (!ps.body && ctx.selection) {
          ps.body = ctx.selection.raw;
          ps.flavors = {
            html : ctx.selection.html
          };
        }
        return ps;
      });
    },
    share: function (ctx, ext, show) {
      this.extract(ctx, ext).then(function (ps) {
        chrome.runtime.sendMessage(TBRL.id, {
          request: 'share',
          show   : show,
          content: checkHttps(update({
            page    : ctx.title,
            pageUrl : ctx.href
          }, ps))
        }, function () { });
      });
    },
    getConfig : function () {
      return new Promise(function (resolve) {
        chrome.runtime.sendMessage(TBRL.id, { request: 'config' }, resolve);
      });
    },
    eval: function () {
      var args = $A(arguments);
      var func = args.shift();
      args = args.map(function (arg) {
        return JSON.stringify(arg);
      }).join(',');
      location.href = 'javascript:void (' + encodeURIComponent(func.toString()) + ')(' + args + ')';
    },

    DOMContentLoaded: (function () {
      return new Promise(function (resolve) {
        if (document.contentType === 'application/pdf') {
          return resolve({});
        }
        document.addEventListener('DOMContentLoaded', resolve, false);
      });
    }()),

    isBackground: function () {
      return false;
    },
    setRequestHandler: function (request, handler) {
      onRequestHandlers[request] = handler;
    }
  };

  Promise.all([
    TBRL.getConfig(),
    TBRL.DOMContentLoaded
  ]).then(function (resses) {
    TBRL.init(resses[0]);
  });

  function downloadFile(url, opt) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage(TBRL.id, {
        request: 'download',
        content: {
          url: url,
          opt: opt
        }
      }, function (res) {
        if (res.success) {
          return resolve(res.content);
        }
        return reject(res.content);
      });
    });
  }

  function base64ToFileEntry(data) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(TBRL.id, {
        request: 'base64ToFileEntry',
        content: data
      }, resolve);
    });
  }

  function getTitle() {
    function title_getter() {
      var title = document.title;
      if (!title) {
        var elms = document.getElementsByTagName('title');
        if (elms.length) {
          title = elms[0].textContent;
        }
      }
      return title;
    }
    var title = title_getter();
    if (title) {
      return Promise.resolve(title);
    }
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', function () {
        resolve(title_getter());
      }, false);
    });
  }

  var onRequestHandlers = {
    popup: function (req, sender, func) {
      var content = req.content, ret;

      (content.title ? Promise.resolve(content.title) : getTitle()).then(function (title) {
        var sel = createFlavoredString(window.getSelection());
        var ctx = update({
          document : document,
          window : window,
          title : title,
          selection : (sel.raw) ? sel : null,
          target : document.documentElement
        }, window.location);
        TBRL.cleanUpContext(ctx);
        if (Extractors.Quote.check(ctx)) {
          ret = Extractors.Quote.extract(ctx);
        } else {
          ret = Extractors.Link.extract(ctx);
        }
        Promise.resolve(ret).then(function (ps) {
          func(checkHttps(update({
            page    : title,
            pageUrl : content.url
          }, ps)));
        });
      });
    },
    contextMenus: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = {};
      var query = null;
      switch (content.mediaType) {
      case 'video':
        ctx.onVideo = true;
        ctx.target = $N('video', {
          src: content.srcUrl
        });
        query = 'video[src=' + JSON.stringify(content.srcUrl) + ']';
        break;
      case 'audio':
        ctx.onVideo = true;
        ctx.target = $N('audio', {
          src: content.srcUrl
        });
        query = 'audio[src=' + JSON.stringify(content.srcUrl) + ']';
        break;
      case 'image':
        ctx.onImage = true;
        ctx.target = $N('img', {
          src: content.srcUrl
        });
        query = 'img[src=' + JSON.stringify(content.srcUrl) + ']';
        break;
      default:
        if (content.linkUrl) {
          // case link
          ctx.onLink = true;
          ctx.link = ctx.target = $N('a', {
            href: content.linkUrl
          });
          ctx.title = content.linkUrl;
          query = 'a[href=' + JSON.stringify(content.linkUrl) + ']';
        }
        break;
      }
      update(ctx, TBRL.createContext((query && document.querySelector(query)) || TBRL.getContextMenuTarget()));
      TBRL.share(ctx, Extractors.check(ctx)[0], true);
    },
    contextMenusQuote: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = update({
        contextMenu: true
      }, TBRL.createContext(TBRL.getContextMenuTarget()));
      // pdf
      if (!ctx.selection) {
        ctx.selection = {
          raw: content.selectionText,
          html: content.selectionText,
        };
      }
      var ext = Extractors.check(ctx).filter(function (m) {
        return (/^Quote/).test(m.name);
      })[0];
      TBRL.share(ctx, ext, true);
    },
    contextMenusLink: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = update({
        title: content.linkUrl,
        onLink: true,
        contextMenu: true
      }, TBRL.createContext(document.querySelector('a[href=' + JSON.stringify(content.linkUrl) + ']') || TBRL.getContextMenuTarget()));
      var ext = Extractors.check(ctx).filter(function (m) {
        return (/^Link/).test(m.name);
      })[0];
      TBRL.share(ctx, ext, true);
    },
    contextMenusImage: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = update({
        onImage: true,
        contextMenu: true
      }, TBRL.createContext(document.querySelector('img[src=' + JSON.stringify(content.srcUrl) + ']') || TBRL.getContextMenuTarget()));
      var ext = Extractors.check(ctx).filter(function (m) {
        return (/^Photo/).test(m.name);
      })[0];
      TBRL.share(ctx, ext, true);
    },
    contextMenusImageCache: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = update({
        onImage: true,
        contextMenu: true
      }, TBRL.createContext(document.querySelector('img[src=' + JSON.stringify(content.srcUrl) + ']') || TBRL.getContextMenuTarget()));
      TBRL.share(ctx, Extractors['Photo - Upload from Cache'], true);
    },
    contextMenusVideo: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = update({
        onVideo: true,
        contextMenu: true
      }, TBRL.createContext(document.querySelector('video[src=' + JSON.stringify(content.srcUrl) + ']') || TBRL.getContextMenuTarget()));
      var ext = Extractors.check(ctx).filter(function (m) {
        return (/^Video/).test(m.name);
      })[0];
      TBRL.share(ctx, ext, true);
    },
    contextMenusAudio: function (req, sender, func) {
      func({});
      var content = req.content;
      var ctx = update({
        onVideo: true,
        contextMenu: true
      }, TBRL.createContext(document.querySelector('audio[src=' + JSON.stringify(content.srcUrl) + ']') || TBRL.getContextMenuTarget()));
      TBRL.share(ctx, Extractors.Audio, true);
    },
    contextMenusCapture: function (req, sender, func) {
      func({});
      var ctx = update({
        contextMenu: true
      }, TBRL.createContext(TBRL.getContextMenuTarget()));
      TBRL.share(ctx, Extractors['Photo - Capture'], true);
    },
    contextMenusBGImage: function (req, sender, func) {
      func({});
      var ctx = update({
        contextMenu: true
      }, TBRL.createContext(TBRL.getContextMenuTarget()));
      var ext = Extractors['Photo - background image'];
      if (ext.check(ctx)) {
        TBRL.share(ctx, ext, true);
      } else {
        window.alert('No background image');
      }
    },
    contextMenusText: function (req, sender, func) {
      func({});
      var ctx = update({
        contextMenu: true
      }, TBRL.createContext(TBRL.getContextMenuTarget()));
      TBRL.share(ctx, Extractors.Text, true);
    },
    contextMenuPrimary: function (req, sender, func) {
      var content = req.content;
      var ctx = {};
      var query = null;
      switch (content.mediaType) {
        case 'video':
          ctx.onVideo = true;
          ctx.target = $N('video', {
            src: content.srcUrl
          });
          query = 'video[src="'+content.srcUrl+'"]';
          break;
        case 'audio':
          ctx.onVideo = true;
          ctx.target = $N('audio', {
            src: content.srcUrl
          });
          query = 'audio[src="'+content.srcUrl+'"]';
          break;
        case 'image':
          ctx.onImage = true;
          ctx.target = $N('img', {
            src: content.srcUrl
          });
          query = 'img[src="'+content.srcUrl+'"]';
          break;
        default:
          if (content.linkUrl) {
            // case link
            ctx.onLink = true;
            ctx.link = ctx.target = $N('a', {
              href: content.linkUrl
            });
            ctx.title = content.linkUrl;
            query = 'a[href="'+content.linkUrl+'"]';
          }
          break;
      }
      update(ctx, TBRL.createContext((query && document.querySelector(query)) || TBRL.getContextMenuTarget()));
      TBRL.share(ctx, Extractors.check(ctx)[0], false);
    }
  };

  chrome.runtime.onMessage.addListener(function (req) {
    var handler = onRequestHandlers[req.request];
    if (handler) {
      handler.apply(this, arguments);
      return true;
    }
  });

  // Start patch
  chrome.runtime.sendMessage(TBRL.id, {
    request: 'loadPatchesInContent',
    visibility: document.webkitVisibilityState
  }, function () {});

  // Construct context-sensitive context menu.
  TBRL.setRequestHandler('contextMenusNoPopup', function (req, sender, func) {
    var content = req.content;
    var ctx = {};
    var query = null;
    switch (content.mediaType) {
      case 'video':
        ctx.onVideo = true;
        ctx.target = $N('video', {
          src: content.srcUrl
        });
        query = 'video[src="'+content.srcUrl+'"]';
        break;
      case 'audio':
        ctx.onVideo = true;
        ctx.target = $N('audio', {
          src: content.srcUrl
        });
        query = 'audio[src="'+content.srcUrl+'"]';
        break;
      case 'image':
        ctx.onImage = true;
        ctx.target = $N('img', {
          src: content.srcUrl
        });
        query = 'img[src="'+content.srcUrl+'"]';
        break;
      default:
        if (content.linkUrl) {
          // case link
          ctx.onLink = true;
          ctx.link = ctx.target = $N('a', {
            href: content.linkUrl
          });
          ctx.title = content.linkUrl;
          query = 'a[href="'+content.linkUrl+'"]';
        }
        break;
    }
    update(ctx, TBRL.createContext((query && document.querySelector(query)) || TBRL.getContextMenuTarget()));
    TBRL.share(ctx, Extractors.check(ctx)[0], false);
  });

  function updateContextMenu(event) {
    var ctx = {};
    switch (event.target.nodeName) {
    case 'IMG':
      ctx.onImage = true;
      ctx.target  = event.target;
      break;
    case 'A':
      ctx.onLink = true;
      ctx.link   = event.target;
      ctx.title  = event.target.title || event.target.text.trim() || event.target.href;
      break;
    }
    update(ctx, TBRL.createContext(event.target));

    var extractors = Extractors.check(ctx).map(function (extractor) { return extractor.name; });

    chrome.runtime.sendMessage(TBRL.id, {
      request   : 'updateContextMenu',
      extractors : extractors
    }, function(res) {});
  }

  window.addEventListener('contextmenu', function(event) {
    updateContextMenu(event);
  }, true);

  window.addEventListener('contextmenu', function(event) {
    busyWait(50);
  }, false);

  function busyWait(waitMilliSeconds) {
    var now = Date.now();
    var end = now + waitMilliSeconds;
    while (now < end) {
      now = Date.now();
    }
  }

  exports.TBRL = TBRL;
  exports.downloadFile = downloadFile;
  exports.base64ToFileEntry = base64ToFileEntry;
  exports.getTitle = getTitle;
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
