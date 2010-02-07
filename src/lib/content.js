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
  target : {x:0, y:0},
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

    window.addEventListener('Taberareloo.link', TBRL.link, false);
    window.addEventListener('Taberareloo.quote', TBRL.quote, false);
    window.addEventListener('Taberareloo.general', TBRL.general, false);
    !TBRL.config['post']['keyconfig'] && document.addEventListener('keydown', TBRL.keyhandler, false);

    (TBRL.userscripts = UserScripts.check()).forEach(function(script){
      script.exec();
    });
  },
  unload : function(){
    document.removeEventListener('unload', TBRL.unload, false);
    !TBRL.config['post']['keyconfig'] && document.removeEventListener('keydown', TBRL.keyhandler, false);
    document.removeEventListener('mousemove', TBRL.mousehandler, false);
    window.removeEventListener('Taberareloo.link', TBRL.link, false);
    window.removeEventListener('Taberareloo.quote', TBRL.quote, false);
    window.removeEventListener('Taberareloo.general', TBRL.general, false);
    TBRL.field_shown && TBRL.field.removeEventListener('click', TBRL.field_clicked, false);
    TBRL.userscripts.forEach(function(script){
      script.unload();
    });
  },
  link : function(ev){
    var ctx = TBRL.createContext(document.documentElement);
    var ext = Extractors.check(ctx).filter(function(m){
      return /^Link/.test(m.name);
    })[0];
    return TBRL.share(ctx, ext, true);
  },
  quote: function(ev){
    var ctx = TBRL.createContext();
    var ext = (Extractors.Quote.check(ctx))? Extractors.Quote : Extractors.Text;
    return TBRL.share(ctx, ext, true);
  },
  general: function(ev){
    // fix stack overflow => reset stack
    callLater(0, function(){
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
    });
  },
  field_clicked: function(ev){
    var button = $X('./ancestor-or-self::button[@class="taberareloo_button"]', ev.target)[0];
    if(button){
      var index = TBRL.buttons.indexOf(button);
      var ext = TBRL.exts[index];
      var ctx = TBRL.ctx;
      TBRL.field_delete();
      return TBRL.share(ctx, ext, true);
    } else {
      TBRL.field_delete();
      return succeed();
    }
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
  createContext: function(target){
    var sel = createFlavoredString(window.getSelection());
    var ctx = update({
      document :document,
      window : window,
      title : document.title,
      selection : (!!sel.raw)? sel : null,
      target : target || TBRL.getTarget() || document.documentElement
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
    TBRL.target.x = ev.clientX;
    TBRL.target.y = ev.clientY;
  },
  getTarget : function(){
    return document.elementFromPoint(TBRL.target.x, TBRL.target.y);
  },
  share: function(ctx, ext, show){
    return maybeDeferred(ext.extract(ctx))
    .addCallback(function(ps){
      chrome.extension.sendRequest(TBRL.id, {
        request: "share",
        show   : show,
        content: update({
          page    : ctx.title,
          pageUrl : ctx.href
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
  },
  eval : function(){
    var args = $A(arguments);
    var func = args.shift();
    args = args.map(function(arg){
      return JSON.stringify(arg);
    }).join(',')
    location.href = "javascript:void ("+encodeURIComponent(func.toString())+")("+args+")";
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
      var sel = createFlavoredString(window.getSelection());
      var ctx = update({
        document :document,
        window : window,
        title : title,
        selection : (!!sel.raw)? sel : null,
        target : TBRL.getTarget() || document
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
