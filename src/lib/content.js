// vim: fileencoding=utf-8
// content script space

var connection = chrome.extension.connect({name : 'TBRL'});

var log = function(){
  var d = new Deferred();
  chrome.extension.sendRequest(TBRL.id, {
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
  id     : chrome.extension.getURL('').match(/chrome-extension:\/\/([^\/]+)\//)[1],
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

    var style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.extension.getURL('styles/general.css');
    document.head.appendChild(style);

    TBRL.insertLDR();
    TBRL.insertGoogleReader();
    TBRL.insertDashboard();

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
    TBRL.dashboard_plus_taberareloo && window.removeEventListener('Taberareloo.Dashboard', TBRL.dashboard, false);
    TBRL.googlereader_plus_taberareloo && document.removeEventListener('keydown', TBRL.googlereader, false);
    TBRL.field_shown && TBRL.field.removeEventListener('click', TBRL.field_clicked, false);
  },
  insertLDR: function(){
    var host = location.host;
    if((host === 'reader.livedoor.com' || host === 'fastladder.com') &&
      TBRL.config['post']['ldr_plus_taberareloo']){

      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/reader.css');
      document.head.appendChild(style);

      var script = document.createElement('script');
      script.type = "text/javascript";
      script.charset = "utf-8";
      script.src = chrome.extension.getURL('lib/ldr_plus_taberareloo.js');
      document.head.appendChild(script);
      window.addEventListener('Taberareloo.LDR', TBRL.ldr, false);
      TBRL.ldr_plus_taberareloo = true;
    }
  },
  ldr : function(ev){
    var data = JSON.parse(ev.data);
    var target = ev.target;
    var body = $X('ancestor::div[starts-with(@id, "item_count")]/parent::div//div[@class="item_body"]', target)[0];
    var ctx = update({
        document  : document,
        window    : window,
        selection : window.getSelection().toString(),
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
  insertGoogleReader: function(){
    if(/^https?:\/\/www\.google\.[^/\.]+\/reader\//.test(location.href) &&
      TBRL.config['post']['googlereader_plus_taberareloo']){
      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/reader.css');

      document.head.appendChild(style);
      document.addEventListener('keydown', TBRL.googlereader, false);
      TBRL.googlereader_plus_taberareloo = true;
    }
  },
  googlereader : function(ev){
    var key = keyString(ev);
    if(key !== 'SHIFT + T') return null;
    stop(ev);
    function get_current_item(){
      var item = {
        parent: null,
        body: null,
        target: null,
        feed: {
          channel: {
            link: null
          }
        }
      }, link;
      try {
        item.parent = $X('id("current-entry")/descendant::div[contains(concat(" ", normalize-space(@class), " "), " entry-container ")]')[0] || null;
        item.body = $X('id("current-entry")/descendant::div[contains(concat(" ", normalize-space(@class), " "), " item-body ")]')[0] || null;
        item.target = $X('id("current-entry")/descendant::a[contains(concat(" ", normalize-space(@class), " "), " entry-title-link ")]')[0] || null;
        link = $X('id("current-entry")/descendant::a[contains(concat(" ", normalize-space(@class), " "), " entry-source-title ")]')[0] || null;
        if(link &&  link.href) item.feed.channel.link = decodeURIComponent(link.href.replace(/^.*\/(?=http)/, ''));
        if(!item.parent || !item.body || !item.target || !item.feed.channel.link){
          throw 'get_current_item error';
        } else {
          return item;
        }
      } catch (e) {
        return null;
      }
    }

    var item = get_current_item();
    if(!item) return null;
    var ctx = update({
      document  : document,
      window    : window,
      selection : window.getSelection().toString(),
      target    : item.target,
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
        return item.feed.channel.link.indexOf(pattern) != -1;
    })){
      ctx.onImage = true;
      ctx.target = $X('./descendant::img[0]', item.body)[0];
    }
    addElementClass(item.parent, 'TBRL_posted');
    var ext = Extractors.check(ctx)[0];
    return TBRL.share(ctx, ext, ext.name.match(/^Link /));
  },
  insertDashboard : function(){
    if(/^http:\/\/www\.tumblr\.com\/dashboard/.test(location.href) &&
      TBRL.config['post']['dashboard_plus_taberareloo']){

      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/dashboard.css');
      document.head.appendChild(style);

      var script = document.createElement('script');
      script.type = "text/javascript";
      script.charset = "utf-8";
      script.src = chrome.extension.getURL('lib/dashboard_plus_taberareloo.js');
      document.head.appendChild(script);

      window.addEventListener('Taberareloo.Dashboard', TBRL.dashboard, false);
      TBRL.dashboard_plus_taberareloo = true;
    }
  },
  dashboard : function(ev){
    var target = ev.target;
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
    var ext = Extractors['ReBlog - Dashboard'];
    if(ext.check(ctx)) TBRL.share(ctx, ext, false);
  },
  link : function(ev){
    maybeDeferred(Extractors.Link.extract(TBRL.createContext()))
    .addCallback(function(ps){
      TBRL.openQuickPostForm(ps);
    });
  },
  quote: function(ev){
    maybeDeferred(Extractors.Quote.extract(TBRL.createContext()))
    .addCallback(function(ps){
      TBRL.openQuickPostForm(ps);
    });
  },
  general: function(ev){
    if(TBRL.field_shown){
      TBRL.field_delete();
    } else {
      if(!TBRL.field){
        TBRL.field = $N('div', {
          id: 'taberareloo_background'
        });
        TBRL.ol = $N('ol', {
          id: 'taberareloo_list'
        });
        TBRL.field.appendChild(TBRL.ol);
      }
      TBRL.field_shown = true;
      TBRL.field.addEventListener('click', TBRL.field_clicked, true);

      var ctx = TBRL.createContext();
      var exts = Extractors.check(ctx);
      TBRL.ctx  = ctx;
      TBRL.exts = exts;
      TBRL.buttons = exts.map(function(ext, index){
        var button = $N('button', {
          'type' : 'button',
          'class': 'taberareloo_button'
        }, [$N('img', {
          src: ext.ICON
        }), $N('span', null, ext.name)]);
        var li = $N('li', {
          'class': 'taberareloo_item'
        }, button);
        TBRL.ol.appendChild(li);
        return button;
      });
      (document.body || document.documentElement).appendChild(TBRL.field);
      TBRL.buttons[0].focus();
    }
  },
  field_clicked: function(ev){
    var button = $X('./ancestor-or-self::button[@class="taberareloo_button"]', ev.target)[0];
    if(button){
      var index = TBRL.buttons.indexOf(button);
      var ext = TBRL.exts[index];
      log(ext.name);
      try{
        maybeDeferred(ext.extract(TBRL.ctx))
        .addCallback(function(ps){
          TBRL.openQuickPostForm(ps);
        }).addErrback(function(e){
          console.log(e);
        });
      }catch(e){}
    }
    TBRL.field_delete();
  },
  field_delete: function(){
    if(TBRL.field_shown){
      TBRL.buttons = null;
      $D(TBRL.ol);
      TBRL.field.parentNode.removeChild(TBRL.field);
      TBRL.field_shown = false;
      TBRL.field.removeEventListener('click', TBRL.field_clicked, false);
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
      ctx.link    = $X('./ancestor-or-self::a', ctx.target)[0];
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
    chrome.extension.sendRequest(TBRL.id, {
      request: "quick",
      content: update({
        page    : document.title,
        pageUrl : location.href
      }, ps)
    }, function(res){
    });
  },
  share: function(ctx, ext, show){
    maybeDeferred(ext.extract(ctx))
    .addCallback(function(ps){
      chrome.extension.sendRequest(TBRL.id, {
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
    chrome.extension.sendRequest(TBRL.id, {
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
