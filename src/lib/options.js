(function(){
var background = chrome.extension.getBackgroundPage();
var Config    = background.TBRL.Config;

connect(document, 'onDOMContentLoaded', document, function(){

  // smoothing slide
  var inner     = $('inner');
  var slides = ['services', 'post', 'entry', 'about', 'changes'];
  var tabs = $A(document.getElementsByClassName('tab'));
  var now_active = 0;
  addElementClass(tabs[now_active], 'active');
  tabs.forEach(function(li){
    var p = li.getElementsByTagName('p')[0];
    var anchor = p.className;
    connect(li, 'onclick', li, function(ev){
      removeElementClass(tabs[now_active], 'active');
      var index = slides.indexOf(anchor);
      if(~index){
        now_active = index;
        addElementClass(tabs[now_active], 'active');
        inner.style.marginLeft = (-index)*100+'%';
      }
    });
  });

  // i18n
  $('label_services').appendChild($T(chrome.i18n.getMessage('label_postConfig')));
  $('label_post').appendChild($T(chrome.i18n.getMessage('label_post')));
  $('label_entry').appendChild($T(chrome.i18n.getMessage('label_entry')));
  $('label_about').appendChild($T(chrome.i18n.getMessage('label_about')));
  $('label_changes').appendChild($T(chrome.i18n.getMessage('label_changes')));
  $('label_tagprovider').appendChild($T(chrome.i18n.getMessage('label_tagprovider')));
  $('label_keyconfig').appendChild($T(chrome.i18n.getMessage('label_keyconfig')));

  $('label_shortcutkey_linkquickpost').appendChild($T(chrome.i18n.getMessage('label_shortcutkey', 'Link')));
  $('label_shortcutkey_quotequickpost').appendChild($T(chrome.i18n.getMessage('label_shortcutkey', 'Quote')));
  $('label_shortcutkey_quickpost').appendChild($T(chrome.i18n.getMessage('label_shortcutkey_general')));
  $('shortcutkey_quickpost_clear').value
  = $('shortcutkey_linkquickpost_clear').value
  = $('shortcutkey_quotequickpost_clear').value
  = $('shortcutkey_ldr_plus_taberareloo_clear').value
  = $('shortcutkey_dashboard_plus_taberareloo_clear').value
  = $('shortcutkey_dashboard_plus_taberareloo_manually_clear').value
  = $('shortcutkey_googlereader_plus_taberareloo_clear').value
  = $('shortcutkey_play_on_tumblr_play_clear').value
  = $('shortcutkey_play_on_tumblr_like_clear').value
  = $('shortcutkey_play_on_tumblr_count_clear').value
  = chrome.i18n.getMessage('label_clear');
  $('label_tagAutoComplete').appendChild($T(chrome.i18n.getMessage('label_tagAutoComplete')));
  $('label_postWithQueue').appendChild($T(chrome.i18n.getMessage('label_postWithQueue')));
  $('label_alwaysShortenURL').appendChild($T(chrome.i18n.getMessage('label_alwaysShortenURL')));
  $('label_clipFullPage').appendChild($T(chrome.i18n.getMessage('label_clipFullPage')));
  $('label_removeHatenaKeyword').appendChild($T(chrome.i18n.getMessage('label_removeHatenaKeyword')));
  $('label_tumblrDefaultQuote').appendChild($T(chrome.i18n.getMessage('label_tumblrDefaultQuote')));
  $('label_userscripts').appendChild($T(chrome.i18n.getMessage('label_userscripts')));
  $('label_multipleTumblelog').appendChild($T(chrome.i18n.getMessage('label_multipleTumblelog')));
  $('label_enableMultipleTumblelog').appendChild($T(chrome.i18n.getMessage('label_enable')));
  $('multi_tumblelogs_button').value = chrome.i18n.getMessage('label_get');
  $('label_thumbnailTemplate').appendChild($T(chrome.i18n.getMessage('label_thumbnailTemplate')));
  $('label_twitterTemplate').appendChild($T(chrome.i18n.getMessage('label_twitterTemplate')));
  $('label_trimReblogInfo').appendChild($T(chrome.i18n.getMessage('label_trimReblogInfo')));
  $('label_notconvertText').appendChild($T(chrome.i18n.getMessage('label_notconvertText')));
  $('label_example').appendChild($T(chrome.i18n.getMessage('label_example')));
  $('save').value = chrome.i18n.getMessage('label_save');

  // services
  var services = new Services();
  // tag provider
  var provider = new Provider();
  // tag auto complete
  var tag_check = new Check('tag_auto_complete', !!Config.post["tag_auto_complete"]);
  // LDR + Taberareloo
  var ldr_check = new Check('ldr_plus_taberareloo', !!Config.post["ldr_plus_taberareloo"]);
  var ldr_short = new Shortcutkey("shortcutkey_ldr_plus_taberareloo", true, function(key){
    return Shortcutkey.keyString2LDR(key);
  });
  // Dashboard + Taberareloo
  var dashboard_check = new Check('dashboard_plus_taberareloo', !!Config.post["dashboard_plus_taberareloo"]);
  var dashboard_short = new Shortcutkey("shortcutkey_dashboard_plus_taberareloo", true);
  var dashboard_manually_check = new Check('dashboard_plus_taberareloo_manually', !!Config.post["dashboard_plus_taberareloo_manually"]);
  var dashboard_manually_short = new Shortcutkey("shortcutkey_dashboard_plus_taberareloo_manually", true);

  // GoogleReader + Taberareloo
  var gr_check = new Check('googlereader_plus_taberareloo', !!Config.post["googlereader_plus_taberareloo"]);
  var gr_short = new Shortcutkey("shortcutkey_googlereader_plus_taberareloo", true);

  // Play on Tumblr - Play
  var play_play_check = new Check('play_on_tumblr_play', !!Config.post["play_on_tumblr_play"]);
  var play_play_short = new Shortcutkey("shortcutkey_play_on_tumblr_play", true);

  // Play on Tumblr - Like
  var play_like_check = new Check('play_on_tumblr_like', !!Config.post["play_on_tumblr_like"]);
  var play_like_short = new Shortcutkey("shortcutkey_play_on_tumblr_like", true);

  // Play on Tumblr - Count
  var play_count_check = new Check('play_on_tumblr_count', !!Config.post["play_on_tumblr_count"]);
  var play_count_short = new Shortcutkey("shortcutkey_play_on_tumblr_count", true);

  // Post with Queue
  var queue_check = new Check('post_with_queue', !!Config.post['post_with_queue']);
  // Shorten URL
  var shorten_check = new Check('always_shorten_url', !!Config.post['always_shorten_url']);
  // Evernote - Clip Full Page
  var clip_fullpage = new Check('evernote_clip_fullpage', !!Config.post['evernote_clip_fullpage']);
  // Quote - Remove Hatena Keywords
  var remove_hatena_keyword = new Check('remove_hatena_keyword', !!Config.post['remove_hatena_keyword']);
  // Evernote - Quote - Post Tumblr with Plain Text
  var tumblr_default_quote = new Check('tumblr_default_quote', !!Config.post['tumblr_default_quote']);
  // multiple tumblelogs
  var tumble_check = new Check('multi_tumblelogs', !!Config.post["multi_tumblelogs"]);
  var tumble_list = new TumbleList();
  // thumbnail template
  var thumbnail = new TemplateInput("thumbnail_template");
  // twitter template
  var twittemp = new TemplateInput("twitter_template");
  // trim reblog info
  var reblog_check = new Check('trim_reblog_info', !!Config.entry["trim_reblog_info"]);
  // notconvert to Text
  var notconvert_check = new Check('not_convert_text', !!Config.entry["not_convert_text"]);
  // keyconfig
  var keyconfig_check = new Check("keyconfig", !!Config.post['keyconfig']);
  // shortcutkey quick link post
  var link_quick_short = new Shortcutkey("shortcutkey_linkquickpost", true);
  // shortcutkey quick link post
  var quote_quick_short = new Shortcutkey("shortcutkey_quotequickpost", true);
  // quick post
  var quick_short = new Shortcutkey("shortcutkey_quickpost", true);

  connect($('save'), 'onclick', window, function(ev){
    var lk = link_quick_short.body();
    var qk = quote_quick_short.body();
    var k = quick_short.body();
    var tcheck = tumble_check.body();
    if(!Shortcutkey.isConflict(lk, qk, k)){
      background.TBRL.configSet({
        'services' : services.body(),
        'post'     : {
          'tag_provider'     : provider.body(),
          'tag_auto_complete': tag_check.body(),
          'ldr_plus_taberareloo': ldr_check.body(),
          'dashboard_plus_taberareloo': dashboard_check.body(),
          'dashboard_plus_taberareloo_manually': dashboard_manually_check.body(),
          'googlereader_plus_taberareloo': gr_check.body(),
          'play_on_tumblr_play': play_play_check.body(),
          'play_on_tumblr_like': play_like_check.body(),
          'play_on_tumblr_count': play_count_check.body(),
          "shortcutkey_ldr_plus_taberareloo"  : ldr_short.body(),
          "shortcutkey_dashboard_plus_taberareloo"  : dashboard_short.body(),
          "shortcutkey_dashboard_plus_taberareloo_manually"  : dashboard_manually_short.body(),
          "shortcutkey_googlereader_plus_taberareloo"  : gr_short.body(),
          "shortcutkey_play_on_tumblr_play"  : play_play_short.body(),
          "shortcutkey_play_on_tumblr_like"  : play_like_short.body(),
          "shortcutkey_play_on_tumblr_count" : play_count_short.body(),
          'keyconfig' : keyconfig_check.body(),
          "evernote_clip_fullpage": clip_fullpage.body(),
          "remove_hatena_keyword" : remove_hatena_keyword.body(),
          "tumblr_default_quote"  : tumblr_default_quote.body(),
          'shortcutkey_linkquickpost': lk,
          "shortcutkey_quotequickpost" : qk,
          "shortcutkey_quickpost" : k,
          "always_shorten_url" : shorten_check.body(),
          "multi_tumblelogs"   : tcheck,
          "post_with_queue"    : queue_check.body()
        },
        'entry'    : {
          'thumbnail_template' : thumbnail.body(),
          'twitter_template' : twittemp.body(),
          'trim_reblog_info'   : reblog_check.body(),
          'not_convert_text'   : notconvert_check.body()
        }
      });
      if(!tcheck){
        tumble_list.remove();
      }
      this.close();
    } else {
      alert(chrome.i18n.getMessage('error_keyConfliction'));
    }
  });
});

var Services = function(){
  var container = $('container');
  var self = this;
  this.all = [];
  var configs = Config['services'] || {};

  background.Models.values.forEach(function(model){
    if(!model.check) return;

    var row = [model.name];
    row.icon = model.ICON;
    row.link = model.LINK;
    var config = configs[model.name] || {};
    Services.TYPES.forEach(function(type){
      var postable = (type === 'favorite')? !!model.favor : model.check({
        type: type,
        pageUrl: {
          match : function(){ return true }
        }
      });
      row.push(config[type] || (postable? 'enabled' : null));
    });
    self.all.push(row);
  });

  var tbody = $('service_body');
  var df = $DF();
  this.elements = {};

  this.all.forEach(function(service){
    var icon = service.icon;
    var link = service.link;
    service = $A(service);
    servicename = service[0];
    self.elements[servicename] = {};
    var children = [];
    if(link){
      children.push($N('a', {
        href: link,
        target: '_blank'
      }, $N('img', {
        src: icon,
        class: 'service_icon'
      })));
    } else {
      children.push($N('img', {
        src: icon,
        class: 'service_icon'
      }));
    }
    children.push($N('p', {
      class: 'service_text'
    }, service[0]+''));
    service[0] = $N('td', null, children);
    var ELMS = Services.ELMS;
    for(var i = 1, len = service.length; i < len; ++i)(function(item, index){
      if(item){
        var container = ELMS.container.cloneNode(false);
        var button = ELMS[item].cloneNode(false);
        container.appendChild(button);
        service[index] = $N('td', null, [container]);
        self.elements[servicename][Services.TYPES[index-1]] = button;
        connect(service[index], 'onclick', service[index], function(ev){
          if(hasElementClass(button, 'enabled')){
            removeElementClass(button, 'enabled');
            addElementClass(button, 'disabled');
          } else if(hasElementClass(button, 'disabled')){
            removeElementClass(button, 'disabled');
            addElementClass(button, 'default');
          } else {
            removeElementClass(button, 'default');
            addElementClass(button, 'enabled');
          }
        });
      } else {
        self.elements[servicename][Services.TYPES[index-1]] = null;
        service[index] = $N('td');
      }
    })(service[i], i);
    var tr = $N('tr', {
      class: 'service',
      id: servicename
    }, service);
    df.appendChild(tr);
  });
  tbody.appendChild(df);
};

Services.TYPES = ['regular', 'photo', 'quote', 'link', 'video', 'audio', 'conversation', 'favorite'];

Services.ELMS = {
  'container': $N('div', {
    class: 'button_container'
  }),
  'enabled': $N('div', {
    class:'button enabled'
  }),
  'disabled': $N('div', {
    class:'button disabled'
  }),
  'default': $N('div', {
    class:'button default'
  })
};

Services.prototype = {
  body: function(){
    var result = {};
    var self = this;
    Object.keys(self.elements).forEach(function(name){
      var val = self.elements[name];
      result[name] = {};
      Services.TYPES.forEach(function(type){
        if(val[type]){
          var button = val[type];
          if(hasElementClass(button, 'enabled')){
            result[name][type] = 'enabled';
          } else if(hasElementClass(button, 'disabled')){
            result[name][type] = 'disabled';
          } else {
            result[name][type] = 'default';
          }
        } else {
          result[name][type] = null;
        }
      });
    });
    return result;
  }
};

var Provider = function(){
  var self = this
  this.provider = Config["post"]["tag_provider"];
  this.radioboxes = [];
  background.Models.values.forEach(function(model){
    if(model.getSuggestions){
      var img = $N('img', {
        src: model.ICON,
        class: 'tag_provider_icon'
      });
      var label = $N('p', {
        class: 'tag_provider_text'
      }, model.name);
      var radio = $N('input', {
        type: 'radio',
        name: 'rag_provider',
        value: model.name
      });
      radio.checked = (self.provider === model.name);
      self.radioboxes.push(radio);
      var set = $N('label', {
        class: 'tag_provider_set'
      }, [radio, img, label]);
      $('tag_providers').appendChild(set);
    }
  });
};

Provider.prototype = {
  body: function(){
    var result = '';
    this.radioboxes.some(function(radio){
      if(radio.checked){
        result = radio.value;
        return true;
      }
      return false;
    });
    return result;
  }
};

var Check = function(name, checked){
  this.check = $(name+'_checkbox');
  this.check.checked = checked;
}

Check.prototype = {
  body: function(){
    return this.check.checked;
  }
};

var TemplateInput = function(id){
  this.input = $(id);
  this.input.value = Config["entry"][id];
};

TemplateInput.prototype = {
  body: function(){
    return this.input.value;
  }
};

var Shortcutkey = function(name, meta, filter){
  var elm = this.elm = $(name);
  var clear = $(name+'_clear');
  this.config = Config["post"][name] || '';
  elm.value = this.config;
  connect(elm, 'onkeydown', elm, function(ev){
    var key = keyString(ev._event);
    switch(key){
    case 'TAB':
    case 'SHIFT + TAB':
      return;
    }
    ev.stop();
    if(filter && !filter(key)) return;
    elm.value = (key==='ESCAPE')? ''  :
                (meta)          ? key : key.split(' + ').pop();
  });
  connect(clear, 'onclick', clear, function(ev){
    elm.value = "";
  });
};

Shortcutkey.isConflict = function(){
  var keys = $A(arguments);
  var set = [];
  for(var i = 0, len = keys.length; i < len; ++i){
    if(!!keys[i]){
      if(~set.indexOf(keys[i])){
        return true;
      } else {
        set.push(keys[i]);
      }
    }
  }
  return false;
};

Shortcutkey.prototype = {
  body: function(){
    return this.elm.value;
  }
};

Shortcutkey.specials = {
  'DELETE'    : 'delete',
  'ESCAPE'    : 'esc',
  'F1'        : 'f1',
  'F2'        : 'f2',
  'F3'        : 'f3',
  'F4'        : 'f4',
  'F5'        : 'f5',
  'F6'        : 'f6',
  'F7'        : 'f7',
  'F8'        : 'f8',
  'F9'        : 'f9',
  'F10'       : 'f10',
  'F11'       : 'f11',
  'F12'       : 'f12'
};
Shortcutkey.defs = {
  'TAB'       : 'tab',
  'BACK_SPACE': 'back',
  'RETURN'    : 'enter',
  'ENTER'     : 'enter',
  'NUMPAD0'   : '0',
  'NUMPAD1'   : '1',
  'NUMPAD2'   : '2',
  'NUMPAD3'   : '3',
  'NUMPAD4'   : '4',
  'NUMPAD5'   : '5',
  'NUMPAD6'   : '6',
  'NUMPAD7'   : '7',
  'NUMPAD8'   : '8',
  'NUMPAD9'   : '9',
  'SPACE'     : 'space',
  'PAGE_UP'   : 'pageup',
  'PAGE_DOWN' : 'pagedown',
  'END'       : 'end',
  'HOME'      : 'home',
  'LEFT'      : 'left',
  'UP'        : 'up',
  'RIGHT'     : 'right',
  'DOWN'      : 'down',
  'A'         : 'a',
  'B'         : 'b',
  'C'         : 'c',
  'D'         : 'd',
  'E'         : 'e',
  'F'         : 'f',
  'G'         : 'g',
  'H'         : 'h',
  'I'         : 'i',
  'J'         : 'j',
  'K'         : 'k',
  'L'         : 'l',
  'M'         : 'm',
  'N'         : 'n',
  'O'         : 'o',
  'P'         : 'p',
  'Q'         : 'q',
  'R'         : 'r',
  'S'         : 's',
  'T'         : 't',
  'U'         : 'u',
  'V'         : 'v',
  'W'         : 'w',
  'X'         : 'x',
  'Y'         : 'y',
  'Z'         : 'z'
};

Shortcutkey.keyString2LDR = function(key){
  var arr = key.split(' + ');
  var memo = {};
  var res = null;
  ['META', 'CTRL', 'SHIFT', 'ALT'].forEach(function(k){
    memo[k] = !!~arr.indexOf(k);
  });
  memo['KEY'] = arr.last();
  if(memo['META'] || memo['ALT']){
    return null;
  }
  if(memo['KEY'] in this.specials){
    if(!(memo['SHIFT'] || memo['CTRL'])){
      return this.specials[memo['KEY']];
    } else {
      return null;
    }
  }
  if(memo['KEY'] in this.defs){
    memo['KEY'] = this.defs[memo['KEY']];
    if(memo['SHIFT']){
      res = memo['KEY'].toUpperCase();
    } else {
      res = memo['KEY'].toLowerCase();
    }
    if(memo['CTRL']){
      res = 'ctrl+' + res;
    }
  }
  return res;
};

var TumbleList = function(){
  var self = this;
  this.field = $("multi_tumble_field");
  this.button = $("multi_tumblelogs_button");
  connect(this.button, 'onclick', this, 'clicked');
  var df = $DF();
  background.Models.multipleTumblelogs.forEach(function(model){
    df.appendChild(self.createElement(model));
  });
  this.field.appendChild(df);
};

TumbleList.prototype = {
  clicked: function(ev){
    var self = this;
    $D(this.field);
    background.Models.getMultiTumblelogs().addCallback(function(models){
      var df = $DF();
      models.forEach(function(model){
        df.appendChild(self.createElement(model));
      });
      self.field.appendChild(df);
    });
  },
  createElement: function(model){
    var img = $N('img', {
      src: model.ICON,
      class: 'tumblelog_icon'
    });
    var label = $N('p', {
      class: 'tumblelog_text'
    }, model.name);
    return $N('div', {
      'class': 'tumblelog'
    }, [img, label]);
  },
  remove: function(){
    background.Models.removeMultiTumblelogs();
  }
};

})();

