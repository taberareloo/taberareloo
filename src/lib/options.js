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

  // services
  var services = new Services();
  // tag provider
  var provider = new Provider();
  // tag auto complete
  var tag_check = new Check('tag_auto_complete', !!Config.post["tag_auto_complete"]);
  // LDR + Taberareloo
  var ldr_check = new Check('ldr_plus_taberareloo', !!Config.post["ldr_plus_taberareloo"]);
  // Dashboard + Taberareloo
  var dashboard_check = new Check('dashboard_plus_taberareloo', !!Config.post["dashboard_plus_taberareloo"]);
  // GoogleReader + Taberareloo
  var gr_check = new Check('googlereader_plus_taberareloo', !!Config.post["googlereader_plus_taberareloo"]);
  // Shorten URL
  var shorten_check = new Check('always_shorten_url', !!Config.post['always_shorten_url']);
  // thumbnail template
  var thumbnail = new ThumbnailTemplate();
  // trim reblog info
  var reblog_check = new Check('trim_reblog_info', !!Config.entry["trim_reblog_info"]);
  // keyconfig
  var keyconfig_check = new Check("keyconfig", !!Config.post['keyconfig']);
  // shortcutkey quick link post
  var link_quick_short = new Shortcutkey("shortcutkey_linkquickpost", true);
  // shortcutkey quick link post
  var quote_quick_short = new Shortcutkey("shortcutkey_quotequickpost", true);
  // quick post
  var quick_short = new Shortcutkey("shortcutkey_quickpost", true);
  connect($('save'), 'onclick', window, function(ev){
    var s  = services.body();
    var p  = provider.body();
    var t  = tag_check.body();
    var ld = ldr_check.body();
    var dsbd = dashboard_check.body();
    var gr = gr_check.body();
    var th = thumbnail.body();
    var r  = reblog_check.body();
    var lk = link_quick_short.body();
    var qk = quote_quick_short.body();
    var k = quick_short.body();
    var sc = shorten_check.body();
    if(!Shortcutkey.isConflict(lk, qk, k)){
      background.TBRL.configSet({
        'services' : s,
        'post'     : {
          'tag_provider'     : p,
          'tag_auto_complete': t,
          'ldr_plus_taberareloo': ld,
          'dashboard_plus_taberareloo': dsbd,
          'googlereader_plus_taberareloo': gr,
          'keyconfig' : keyconfig_check.body(),
          'shortcutkey_linkquickpost': lk,
          "shortcutkey_quotequickpost" : qk,
          "shortcutkey_quickpost" : k,
          "always_shorten_url" : sc
        },
        'entry'    : {
          'thumbnail_template' : th,
          'trim_reblog_info'   : r
        }
      });
      this.close();
    } else {
      alert('Key Definition Conflict \n  Please set different keys each other');
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
    service = $A(service);
    servicename = service[0];
    self.elements[servicename] = {};
    service[0] = $N('td', null, [
      $N('img', {
        src: icon,
        class: 'service_icon'
      }),
      $N('p', {
        class: 'service_text'
      }, service[0]+'')
    ]);
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

Services.TYPES = ['regular', 'photo', 'quote', 'link', 'video', 'conversation', 'favorite'];

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
  }),
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
      var set = $N('div', {
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

var ThumbnailTemplate = function(){
  this.input = $('thumbnail_template');
  this.input.value = Config["entry"]["thumbnail_template"];
};

ThumbnailTemplate.prototype = {
  body: function(){
    return this.input.value;
  }
};

var Shortcutkey = function(name, meta){
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

})();

