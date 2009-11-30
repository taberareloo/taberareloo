// vim: fileencoding=utf-8
// content script space
(function(){
  if(window !== window.parent) return;

  var connection = chrome.extension.connect({name : 'TBRL'});
  var lid = 0;
  var TBRL = {
    target : null,
    init : function(){
      // 確認
      //document.addEventListener('keydown', TBRL.keyhandler, false);
      document.addEventListener('mousemove', TBRL.mousehandler, false);
      document.addEventListener('unload', TBRL.unload, false);
      connection.onMessage.addListener(function(item){
        var type = item.type;
        if(type === 'request'){
          request_handler(item);
        } else if(type === 'post'){
          post_handler(item);
        }
      });
    },
    unload : function(){
      document.removeEventListener('unload', TBRL.unload, false);
      //document.removeEventListener('keydown', TBRL.handler, false);
      document.removeEventListener('mousemove', TBRL.mousehandler, false);
    },
    keyhandler : function(ev){
      var id = ev.keyIdentifier;
      var t = ev.target;
      if(t.nodeType === 1){
        var tag = t.tagName.toLowerCase();
        if(tag === 'input' || tag === 'textarea'){
          return;
        }
        // alt + z
        if(id === "U+005A" && (ev.metaKey || ev.altKey) && !ev.shiftKey && !ev.ctrlKey){
          var context = update({
            document :document,
            window : window,
            title : document.title,
            selection : ''+window.getSelection(),
            target : TBRL.target || document,
          }, window.location);
          var exts = Extractors.check(context);
          if(exts.length){
            exts[0].extract(context)
            .addCallback(function(res){
              return post(res);
            });
          }
        }
      }
    },
    mousehandler : function(ev){
      // 監視
      TBRL.target = ev.target;
    }
  }
  TBRL.init();

  // Extractors
  var Extractors = new Repository();
  Extractors.register([
    {
      name : 'ReBlog',
      TUMBLR_URL : 'http://www.tumblr.com/',
      extractByLink : function(ctx, link){
        var self = this;
        return request(link).addCallback(function(res){
          var text = res.responseText;
          var doc = createHTML(res.responseText);
          ctx.href = link;
          var m = text.match(/<title(?:\s[^>]+?)?>([\S\s]*?)<\/title\s*>/i);
          ctx.title = ((m)? m[1] : '').replace(/[\n\r]/g, '');
          return self.extractByPage(ctx, doc);
        });
      },

      getForm : function(url){
        var self = this;
        return request(url).addCallback(function(res){
          var doc = createHTML(res.responseText);
          var form = formContents($X('//form', doc)[1]);
          delete form.preview_post;
          form.redirect_to = self.TUMBLR_URL+'dashboard';
          if(form.reblog_post_id){
            // self.trimReblogInfo(form);
            // Tumblrから他サービスへポストするため画像URLを取得しておく
            if(form['post[type]']=='photo')
              form.image = $X('id("edit_post")//img[contains(@src, "media.tumblr.com/") or contains(@src, "data.tumblr.com/")]/@src', doc)[0].value;
          }
          return form;
        });
      },

      extractByPage : function(ctx, doc){
        return this.extractByEndpoint(ctx,
          unescapeHTML(this.getFrameUrl(doc)).replace(/.+&pid=(.*)&rk=(.*)/, this.TUMBLR_URL+'reblog/$1/$2'));
      },

      extractByEndpoint : function(ctx, endpoint){
        var self = this;
        return this.getForm(endpoint).addCallback(function(form){
          return update({
            type     : form['post[type]'],
            item     : ctx.title,
            itemUrl  : ctx.href,
            favorite : {
              name     : 'Tumblr',
              endpoint : endpoint,
              form     : form,
            },
          }, self.convertToParams(form));
        })
      },

      getFrameUrl : function(doc){
        var elm = $X('//iframe[starts-with(@src, "http://www.tumblr.com/dashboard/iframe") and contains(@src, "pid=")]/@src', doc);
        if(elm.length){
          return elm[0].value;
        } else {
          return null;
        }
      },

      convertToParams  : function(form){
        switch(form['post[type]']){
        case 'regular':
          return {
            type    : 'quote',
            item    : form['post[one]'],
            body    : form['post[two]'],
          }
        case 'photo':
          return {
            itemUrl : form.image,
            body    : form['post[two]'],
          }
        case 'link':
          return {
            item    : form['post[one]'],
            itemUrl : form['post[two]'],
            body    : form['post[three]'],
          };
        case 'quote':
          // FIXME: post[two]検討
          return {
            body    : form['post[one]'],
          };
        case 'video':
          // FIXME: post[one]検討
          return {
            body    : form['post[two]'],
          };
        case 'conversation':
          return {
            item : form['post[one]'],
            body : form['post[two]'],
          };
        }
      },
    },
    {
      name : 'ReBlog - Tumblr',
      ICON : 'chrome://tombloo/skin/reblog.ico',
      check : function(ctx){
        return Extractors.ReBlog.getFrameUrl(ctx.document);
      },
      extract : function(ctx){
        return Extractors.ReBlog.extractByPage(ctx, ctx.document);
      },
    },
    {
      name : 'ReBlog - Dashboard',
      ICON : 'chrome://tombloo/skin/reblog.ico',
      check : function(ctx){
        return (/(tumblr-beta\.com|tumblr\.com)\//).test(ctx.href) && this.getLink(ctx);
      },
      extract : function(ctx){
        // タイトルなどを取得するためextractByLinkを使う(reblogリンクを取得しextractByEndpointを使った方が速い)
        return Extractors.ReBlog.extractByLink(ctx, this.getLink(ctx));
      },
      getLink : function(ctx){
        var link = $X('./ancestor-or-self::li[starts-with(normalize-space(@class), "post")]//a[@title="Permalink"]', ctx.target)[0];
        return link && link.href;
      },
    },
    {
      name : 'Link',
      ICON : 'chrome://tombloo/skin/link.png',
      check : function(ctx){
        return true;
      },
      extract : function(ctx){
        return {
          type    : 'link',
          item    : ctx.title,
          itemUrl : ctx.href
        }
      },
    }
  ]);

  Callbacks = {};
  var request = (function(){
    var ID = 0;
    return function(url, opt){
      var id = "request_"+(++ID);
      var ret = Callbacks[id] = new Deferred();
      connection.postMessage({
        "type" : "request",
        "url" : url,
        "opt" : opt,
        "id" : id
      });
      return ret;
    }
  })();
  var request_handler = function(item){
    var d = Callbacks[item.id];
    if(d){
      delete Callbacks[item.id];
      var suc = item.success;
      if(suc){
        d.callback(item.res);
      } else {
        d.errback(item.res);
      }
    }
  };
  var post = (function(){
    var ID = 0;
    return function(ps){
      var id = "post_"+(++ID);
      var ret = Callbacks[id] = new Deferred();
      connection.postMessage({
        "type" : "post",
        "ps" : ps,
        "id" : id
      });
      return ret;
    }
  })();
  var post_handler = function(item){
    var d = Callbacks[item.id];
    if(d){
      delete Callbacks[item.id];
      var suc = item.success;
      if(suc){
        d.callback(item.res);
      } else {
        d.errback(item.res);
      }
    }
  };
  chrome.extension.onRequest.addListener(function(req, sender, func){
    function title_getter(){
      var title = document.title;
      if(!title){
        var elms = document.getElementsByTagName('title');
        if(elms.length){
          title = elms[0].textContent;
        }
      }
      return title;
    }
    if(req.request === 'title'){
      var title = title_getter();
      if(title){
        func({
          title: title
        });
      } else {
        connect(document, 'onDOMContentLoaded', null, function(ev){
          func({
            title: title_getter()
          });
        });
      }
    }
  });
})();
