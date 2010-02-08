// vim: fileencoding=utf-8

function backgroundAlert(message){
  alert(message);
}

function backgroundConfirm(message){
  return confirm(message);
}

function backgroundError(message, url){
  var res = confirm(message);
  if(res){
    chrome.tabs.getSelected(null, function(tab){
      chrome.tabs.create({
        index:tab.index+1,
        url:url,
        selected:true
      });
    });
  }
}

function addTab(url, focus){
  chrome.tabs.create({
    url: url,
    selected: focus
  });
}

window.addEventListener('load', function(){
  chrome.self.onConnect.addListener(function(port){
    // connection session
    port.onMessage.addListener(function(item, con){
      var type = item.type;
      if(type === 'request'){
        request_handler(item, con);
      } else if(type === 'post'){
        post_handler(item, con);
      }
    });
  });
  var CHROME_GESTURES = 'jpkfjicglakibpenojifdiepckckakgk';
  var CHROME_KEYCONFIG = 'okneonigbfnolfkmfgjmaeniipdjkgkl';
  var action = {
    group:'Taberareloo',
    actions:[
      {name:'Taberareloo.link'},
      {name:'Taberareloo.quote'},
      {name:'Taberareloo.general'}
    ]
  };
  chrome.extension.sendRequest(CHROME_GESTURES, action);
  chrome.extension.sendRequest(CHROME_KEYCONFIG, action);
}, false);

var request_handler = function(item, con){
  var opt = item.opt;
  var url = item.url;
  var id = item.id;
  return request(url, opt).addCallbacks(function(res){
    con.postMessage({
      type : "request",
      id   : id,
      res  : res,
      success : true
    });
  }, function(res){
    con.postMessage({
      type : "request",
      id   : id,
      res  : res,
      success: false
    });
  });
}

var post_handler = function(item, con){
  var ps = item.ps;
  var id = item.id;
  win = open(chrome.extension.getURL('quickpostform.html'), '_blank', 'alwaysRaised=yes,toolbar=no,directories=no,status=no,menubar=no,scrollbars=no,location=no,dependent=yes,z-lock=yes');
  win.QuickPostForm = {};
  win.ps = ps;
  win.Models = Models
};

function request_v1(url,opt){
  opt = update({
    method: 'GET'
  }, opt || {});
  if(opt.sendContent){
    opt.method = 'POST';
    opt.sendContent = queryString(opt.sendContent, false);
  }
  if(opt.method && opt.method.toUpperCase() === 'POST'){
    if(!opt.headers) opt.headers = [];
    opt.headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  }
  return doXHR(url, opt);
};

function binaryRequest(url, opt){
  return request(url, update({
    charset: 'text/plain; charset=x-user-defined'
  }, opt)).addCallback(function(res){
    res.responseText = res.responseText.replace(/[\u0100-\uffff]/g, function(c){
      return String.fromCharCode(c.charCodeAt(0) & 0xff);
    });
    return res;
  });
};

// 2回requestすることでcharset判別する.
function encodedRequest(url, opt){
  return binaryRequest(url, opt).addCallback(function(res){
    var binary  = res.responseText;
    var charset = null;
    var header = res.getResponseHeader('Content-Type');
    if(header) charset = getCharset(header);
    if(!charset) charset = getEncoding(binary);
    if(!charset) charset = 'utf-8';
    return request(url, update({
      charset: 'text/html; charset='+charset
    }, opt));
  });
};

// canvas request
function canvasRequest(url){
  var canvas = document.createElement('canvas'),
      ret    = new Deferred(),
      img    = new Image();
  img.addEventListener('load', function(res){
    img.removeEventListener('load', arguments.callee, false);
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ret.callback({
      contentType: 'image/png',
      base64: true,
      height: img.naturalHeight,
      width : img.naturalWidth,
      binary: canvas.toDataURL('image/png', '')
    })
  }, false);
  img.src = url;
  return ret;
};

function getEncoding(text){
  var matched = text.match(/<meta.+?http-equiv.+?Content-Type.+?content=(["'])([^\1]+?)\1/i);
  var res = (matched && !matched[2].match(/UTF-8/i) && matched[2]);
  return (res)? getCharset(res) : false;
};

function getCharset(text){
  var matched = text.match(/charset\s*=\s*(\S+)/);
  return (matched && !matched[1].match(/UTF-8/i) && matched[1]);
};

function request(url, opt){
  var req = new XMLHttpRequest(), ret = new Deferred();

  opt = update({
    method: 'GET'
  }, opt || {});

  if(opt.queryString){
    var qs = queryString(opt.queryString, true);
    url += qs;
  }

  if(opt.sendContent){
    opt.method = 'POST';
    opt.sendContent = queryString(opt.sendContent, false);
  }

  if('username' in opt){
    req.open(opt.method ? opt.method : (opt.sendContent)? 'POST' : 'GET', url, true, opt.username, opt.password);
  } else {
    req.open(opt.method ? opt.method : (opt.sendContent)? 'POST' : 'GET', url, true);
  }

  if(opt.charset) req.overrideMimeType(opt.charset);

  //req.setRequestHeader("X-Requested-With", "XMLHttpRequest");

  var setHeader = true;
  if(opt.headers){
    if(opt.headers['Content-Type']){
      setHeader = false;
    }
    Object.keys(opt.headers).forEach(function(key){
      req.setRequestHeader(key, opt.headers[key]);
    });
  }
  if(setHeader){
    if(opt.sendContent){
      req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    } else {
      req.setRequestHeader('Content-Type', 'application/octet-stream');
    }
  }

  var position = -1;
  var error = false;

  req.onprogress = function(e){
    position = e.position;
  }
  req.onreadystatechange = function(e){
    if(req.readyState === 4){
      var length = 0;
      try {
        length = parseInt(req.getResponseHeader('Content-Length'), 10);
      } catch(e) {
        console.log('ERROR', e);
      }
      // 最終時のlengthと比較
      if(position !== length){
        if(opt.denyRedirection){
          ret.errback(req);
          error = true;
        }
      }
      if(!error){
        if(req.status >= 200 && req.status < 300){
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

function getSelected(){
  var d = new Deferred();
  chrome.tabs.getSelected(null, function(tab){
    if(TBRL.Service.isEnableSite(tab.url)){
      d.callback(tab);
    }
  });
  return d;
};

var TBRL = {
  // default config
  VERSION: '1.1.2',
  Config: {
    "services": {
    },
    "post"    : {
      "tag_provider"      : "HatenaBookmark",
      "tag_auto_complete" : true,
      "ldr_plus_taberareloo" : false,
      "dashboard_plus_taberareloo" : false,
      "googlereader_plus_taberareloo" : false,
      "shortcutkey_ldr_plus_taberareloo"  : "T",
      "shortcutkey_dashboard_plus_taberareloo"  : "T",
      "shortcutkey_googlereader_plus_taberareloo"  : "SHIFT + T",
      "keyconfig"            : true,
      "shortcutkey_linkquickpost"  : "",
      "shortcutkey_quotequickpost" : "",
      "shortcutkey_quickpost" : "",
      "evernote_clip_fullpage": true,
      "always_shorten_url"    : false,
      "multi_tumblelogs"      : false,
      "post_with_queue"       : false
    },
    "entry"   : {
      "trim_reblog_info"  : false,
      "thumbnail_template": ""
    }
  },
  Service: {
    post: function(ps, posters){
      var self = this;
      var ds   = {};
      posters = [].concat(posters);
      posters.forEach(function(p){
        try{
          ds[p.name] = (ps.favorite && RegExp('^' + ps.favorite.name + '(\\s|$)').test(p.name))? p.favor(ps) : p.post(ps);
        } catch(e){
          ds[p.name] = fail(e);
        }
      });
      return new DeferredHash(ds).addCallback(function(ress){
        var errs = [];
        for(var name in ress){
          var success = ress[name][0], res = ress[name][1];
          if(!success){
            var msg = name + ': ' +
              (res.message.status ? '\n' + ('HTTP Status Code ' + res.message.status).indent(4) : '\n' + res.message.indent(4));
            errs.push(msg);
          }
        }
        if(errs.length){
          self.alertError(chrome.i18n.getMessage('error_post', [errs.join('\n').indent(2), ps.page, ps.pageUrl]), ps.pageUrl);
        } else {
          delete TBRL.Popup.contents[ps.itemUrl];
        }
      }).addErrback(function(err){
        self.alertError(err, ps.pageUrl);
      });
    },
    isEnableSite: function(link){
      return link.indexOf('http') === 0;
    },
    alertError: function(error, url){
      var res = confirm(error + '\n\n' + chrome.i18n.getMessage('error_reopen'));
      if(res){
        chrome.tabs.create({
          url: url,
          selected: true
        });
      }
    }
  },
  Popup: {
    count: 0,
    open: function(tab, ps){
      var height = 'height=450';
      if(ps.type === 'quote' || ps.type === 'regular'){
        height = 'height=250'
      }
      var id = 'QuickPost'+(TBRL.Popup.count++);
      var query = queryString({
        'quick' : 'true',
        'id'    : id
      }, true);
      TBRL.Popup.data[id] = {
        'ps': ps,
        'tab': tab
      };
      window.open(chrome.extension.getURL('popup.html')+query, id, height+',width=450,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no');
    },
    defaultSuggester: 'HatenaBookmark',
    tags : null,
    tabs: [],
    data: {},
    contents : {},
    suggestionShownDefault: false
  },
  configSet: function(config){
    TBRL.Config = config;
    window.localStorage.options = JSON.stringify(config);
  },
  configUpdate: function(log){
    function setter(key, def, target){
      var val = def[key];
      var res = typeof(val);
      if(Array.isArray(val)){
        if(!(target[key]))
          target[key] = [];
        for(var i = 0, l = val.length; i < l; ++i){
          setter(i, val, target[key]);
        }
      } else {
        switch(res){
          case 'string':
          case 'number':
          case 'function':
          case 'boolean':
            target[key] = val;
            break;
          default:
            if(val instanceof Date   ||
               val instanceof RegExp ||
               val instanceof String ||
               val instanceof Number ||
               val === null){
              target[key] = val;
            } else {
              if(!(target[key]))
                target[key] = {};
              Object.keys(val).forEach(function(k){
                setter(k, val, target[key]);
              });
            }
        }
      }
    }
    Object.keys(log).forEach(function(k){
      setter(k, log, TBRL.Config);
    });
    TBRL.Config.version = TBRL.VERSION;
  }
};

if(window.localStorage.options){
  TBRL.configUpdate(JSON.parse(window.localStorage.options));
} else {
  window.localStorage.options = JSON.stringify(TBRL.Config);
}

if(TBRL.Config.post['multi_tumblelogs']) Models.getMultiTumblelogs();

var onRequestsHandlers = {
  capture: function(req, sender, func){
    callLater(0.5, function(){
      chrome.tabs.captureVisibleTab(sender.tab.windowId, function(data){
        func(data);
      });
    });
  },
  share: function(req, sender, func){
    getSelected().addCallback(function(tab){
      var ps = req.content;
      if(req.show){
        TBRL.Popup.open(tab, ps);
      } else {
        var posters = Models.getDefaults(ps);
        if(!posters.length){
          alert(chrome.i18n.getMessage('error_noPoster', ps.type.capitalize()));
        } else {
          TBRL.Service.post(ps, posters);
        }
      }
      func({});
    }).addErrback(function(e){
    });
  },
  config: function(req, sender, func){
    func(TBRL.Config);
  },
  log: function(req, sender, func){
    console.log.apply(console, req.content);
    func(req.content);
  }
}

chrome.extension.onRequest.addListener(function(req, sender, func){
  var handler = onRequestsHandlers[req.request];
  handler && handler.apply(this, arguments);
});

