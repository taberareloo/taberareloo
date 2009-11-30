// vim: fileencoding=utf-8

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

var request = function(url,opt){
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

var TBRL = {
  // default config
  Config: {
    "version" : "0.0.2",
    "services": {
    },
    "post"    : {
      "tag_auto_complete" : true,
      "tag_provider"      : "HatenaBookmark"
    },
    "entry"   : {
      "trim_reblog_info"  : false,
      "thumbnail_template": ""
    }
  },
  Service: {
    post: function(ps){
    }
  },
  Popup: {
    defaultSuggester: 'HatenaBookmark',
    tags : null
  },
  configSet: function(config){
    TBRL.Config = config;
    window.localStorage.options = JSON.stringify(config);
  }
};

if(window.localStorage.options){
  TBRL.Config = JSON.parse(window.localStorage.options);
} else {
  window.localStorage.options = JSON.stringify(TBRL.Config);
}

