// vim: fileencoding=utf-8
// content script space

var connection = chrome.extension.connect({name : 'TBRL'});
var id = chrome.extension.getURL('').match(/chrome-extension:\/\/([^\/]+)\//)[1];

var log = function(){
  var d = new Deferred();
  chrome.extension.sendRequest(id, {
    request: "log",
    content: $A(arguments)
  }, function(res){
    d.callback(res);
  });
  return d;
}

var TBRL = {
  target : null,
  config : null,
  ldr_plus_taberareloo : false,
  init : function(config){
    TBRL.config = config;
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

    var host = location.host;
    if((host === 'reader.livedoor.com' || host === 'fastladder.com') &&
      TBRL.config['post']['ldr_plus_taberareloo']){

      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/ldr.css');
      document.head.appendChild(style);

      var script = document.createElement('script');
      script.type = "text/javascript";
      script.charset = "utf-8";
      script.src = chrome.extension.getURL('lib/ldr_plus_taberareloo.js');
      document.head.appendChild(script);
      window.addEventListener('Taberareloo.LDR', TBRL.ldr, false);
      TBRL.ldr_plus_taberareloo = true;
    }
    window.addEventListener('Taberareloo.link', TBRL.link, false);
    window.addEventListener('Taberareloo.quote', TBRL.quote, false);
    window.addEventListener('Taberareloo.general', TBRL.general, false);
    !TBRL.config['post']['keyconfig'] && document.addEventListener('keydown', TBRL.keyhandler, false);
  },
  unload : function(){
    !TBRL.config['post']['keyconfig'] && document.removeEventListener('unload', TBRL.unload, false);
    document.removeEventListener('keydown', TBRL.handler, false);
    document.removeEventListener('mousemove', TBRL.mousehandler, false);
    window.removeEventListener('Taberareloo.link', TBRL.link, false);
    window.removeEventListener('Taberareloo.quote', TBRL.quote, false);
    window.removeEventListener('Taberareloo.general', TBRL.general, false);
    TBRL.ldr_plus_taberareloo && window.removeEventListener('Taberareloo.LDR', TBRL.ldr, false);
  },
  ldr : function(ev){
    var data = JSON.parse(ev.data);
    var target = ev.target;
    var body = $X('ancestor::div[starts-with(@id, "item_count")]/parent::div//div[@class="item_body"]', target)[0];
    var ctx = update({
        document  : document,
        window    : window,
        selection : '' + window.getSelection(),
        target    : target,
        event     : {},
        title     : null,
        mouse     : null,
        menu      : null
    }, window.location);
    if([
      'flickr.com/',
      'http://ffffound.com',
      'http://www.bighappyfunhouse.com',
      'http://f.hatena.ne.jp',
      'http://lpcoverlover.com',
      'http://www.chicksnbreasts.com',
      '1eb46a2f1f83c340eee10cd49c144625'].some(function(pattern){
        return ~data.feed.indexOf(pattern);
    })){
      ctx.onImage = true;
      ctx.target = $X('.//img[1]', body)[0];
    }
    var ext = Extractors.check(ctx)[0];
    return TBRL.share(ctx, ext, ext.name.match(/^Link /));
  },
  link : function(ev){
    return maybeDeferred(Extractors.Link.extract(TBRL.createContext()))
    .addCallback(function(ps){
      TBRL.openQuickPostForm(ps);
    });
  },
  quote: function(ev){
    return maybeDeferred(Extractors.Photo.extract(TBRL.createContext()))
    .addCallback(function(ps){
      TBRL.openQuickPostForm(ps);
    });
  },
  general: function(ev){
    var ctx = TBRL.createContext();
    var exts = Extractors.check(ctx);
    log(exts[0].name);
    if(exts.length){
      maybeDeferred(exts[0].extract(ctx))
      .addCallback(function(ps){
        TBRL.openQuickPostForm(ps);
      });
    }
  },
  keyhandler : function(ev){
    var t = ev.target;
    if(t.nodeType === 1){
      try{
      var tag = tagName(t);
      if(tag === 'input' || tag === 'textarea'){
        return;
      }
      var key = keyString(ev);
      var link_quick_post = TBRL.config['post']['shortcutkey_linkquickpost'];
      var quote_quick_post = TBRL.config['post']['shortcutkey_quotequickpost'];
      var quick_post = TBRL.config['post']['shortcutkey_quickpost'];
      if(link_quick_post && key === link_quick_post){
        TBRL.link();
      } else if(quote_quick_post && key === quote_quick_post){
        TBRL.quote();
      } else if(quick_post && key === quick_post){
        TBRL.general();
      }
      }catch(e){
        alert(e);
      }
    }
  },
  createContext: function(){
    var ctx = update({
      document :document,
      window : window,
      title : document.title,
      selection : window.getSelection().toString(),
      target : TBRL.target || document
    }, window.location);
    if(ctx.target){
      ctx.link    = $X('./ancestor::a', ctx.target)[0];
      ctx.onLink  = !!ctx.link;
      ctx.onImage = ctx.target instanceof HTMLImageElement;
    }
    return ctx;
  },
  mousehandler : function(ev){
    // 監視
    TBRL.target = ev.target;
  },
  openQuickPostForm : function(ps){
    chrome.extension.sendRequest(id, {
      request: "quick",
      content: update({
        page    : document.title,
        pageUrl : location.href
      }, ps)
    }, function(res){ });
  },
  share: function(ctx, ext, show){
    maybeDeferred(ext.extract(ctx))
    .addCallback(function(ps){
      chrome.extension.sendRequest(id, {
        request: "share",
        show   : show,
        content: update({
          page    : document.title,
          pageUrl : location.href
        }, ps)
      }, function(res){ });
    });
  },
  getConfig : function(){
    var d = new Deferred();
    chrome.extension.sendRequest(id, {
      request: "config"
    }, function(res){
      d.callback(res);
    });
    return d;
  }
}
TBRL.getConfig().addCallback(TBRL.init);

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

var getTitle = function(){
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
  var title = title_getter();
  if(title){
    return succeed(title);
  } else {
    var d = new Deferred();
    connect(document, 'onDOMContentLoaded', null, function(ev){
      d.callback(title_getter());
    });
    return d;
  }
};

chrome.extension.onRequest.addListener(function(req, sender, func){
  if(req.request === 'popup'){
    var content = req.content;
    (content.title ? succeed(content.title):getTitle()).addCallback(function(title){
      var ctx = update({
        document :document,
        window : window,
        title : title,
        selection : window.getSelection().toString(),
        target : TBRL.target || document
      }, window.location);
      if(Extractors.Quote.check(ctx)){
        var d = Extractors.Quote.extract(ctx);
      } else {
        var d = Extractors.Link.extract(ctx);
      }
      maybeDeferred(d).addCallback(function(ps){
        func(update({
          page    : title,
          pageUrl : content.url
        }, ps));
      });
    });
  }
});
