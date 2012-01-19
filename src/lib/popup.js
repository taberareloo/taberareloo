// -*- coding: utf-8 -*-

var background = chrome.extension.getBackgroundPage();
var form = null;
var Config  = background.TBRL.Config;

function getPs(query) {
  var d = new Deferred();
  if (query.quick) {
    // if quick post form, not call getSelected
    var id = query['id'];
    var data = background.TBRL.Popup.data[id];
    var tab = data['tab'];
    var ps = data['ps'];
    delete background.TBRL.Popup.data[id];
    setTimeout(function() { d.callback(ps); }, 0);
  } else {
    chrome.tabs.getSelected(null, function(tab){
      if (background.TBRL.Service.isEnableSite(tab.url)) {
        if (background.TBRL.Popup.contents[tab.url]) {
          d.callback(background.TBRL.Popup.contents[tab.url]);
        } else {
          chrome.tabs.sendRequest(tab.id, {
            request: 'popup',
            content: {
              title: tab.title,
              url  : tab.url
            }
          }, function(ps){
            d.callback(ps);
          });
        }
      } else {
        window.close();
      }
    });
  }
  return d;
}

connect(window, 'onDOMContentLoaded', window, function(ev){
  var query = queryHash(location.search);
  getPs(query).addCallback(function(ps) { form = new Form(ps, !query.quick); });
});

function Form(ps, isPopup) {
  this.ps = ps;
  this.posted = false;
  this.canceled = false;
  this.savers = {};
  this.toggles = [];
  this.shown = false;
  this.notify = new Notify();
  // this.shortcutkeys = background.TBRL.Popup.shortcutkeys;

  this.savers['enabledPosters'] = this.posters = new Posters(ps, this);

  var icon = this.icon = $('typeIcon');
  icon.setAttribute('src', 'skin/'+ps.type+'.png');
  var type = $('type');
  type.appendChild($T(ps.type));

  connect(window, 'onunload', this, function(ev){
    if(!this.posted && isPopup && !this.canceled){
      this.save();
    } else {
      this.delete();
    }
  });

  connect(window, 'onkeydown', this, function(ev){
    var key = keyString(ev._event);
    var func = Form.shortcutkeys[key];
    func && func.call(this, ev);
  });

  connect($('post'), 'onclick', this, 'post');

  var toggle_detail = $('toggle_detail');
  connect(toggle_detail, 'onclick', this, function(ev){
    if(!addElementClass(toggle_detail, 'extended')){
      removeElementClass(toggle_detail, 'extended');
    }
    this.toggle();
  });

  if (isPopup) {
    var cancel = $N('button', {
      'type' : 'button',
      'id'   : 'cancel',
      'title': 'Cancel this post contents'
    }, 'Cancel');
    connect(cancel, 'onclick', this, 'cancel');
    $("icon_container").appendChild(cancel);
  }

  if (ps.https.pageUrl[0] || ps.https.itemUrl[0]) {
    // pageUrl or itemUrl is https
    var list = [];
    if (ps.https.pageUrl[0]) {
      list.push(chrome.i18n.getMessage('warning_https', [
                                        "PageURL",
                                        ps.https.pageUrl[1],
                                        ps.pageUrl]));
    }
    if (ps.https.itemUrl[0]) {
      list.push(chrome.i18n.getMessage('warning_https',[
                                        "ItemURL",
                                        ps.https.itemUrl[1],
                                        ps.itemUrl]));
    }
    list.push(chrome.i18n.getMessage('confirm_https'));
    var df = $DF();
    df.appendChild($T(list.join('\n')));
    var button = $N('button', {
      'type' : 'button',
      'id'   : 'https_link',
      'title': 'Allow posting https link'
    }, 'Allow');
    df.appendChild(button);
    connect(button, 'onclick', this, 'allowHttps');
    df.appendChild($T('\n'));
    this.notify.show(df, true);
  }

  this[ps.type] && this[ps.type]();

  if (this.posters.hasPoster('Google+')) {
    this.savers['scope'] = this.streams = new Streams(this.posters);
  }
}

Form.prototype = {
  link: function(){
    var ps = this.ps;
    var title   = this.savers['item'] = this.title = new Title(ps);
    var link    = this.savers['itemUrl'] = this.link = new Link(ps, true);
    var tags    = this.savers['tags'] = this.tags  = new Tags(ps);
    var desc    = this.savers['description'] = this.desc = new Desc(ps);
    this.toggles = [title, link];
    tags.focus();
    // resize timing depends on type.
    // in photo type case, resize timing is when image is loaded
    callLater(0.5, Form.resize);
  },
  quote: function(){
    var ps = this.ps;
    var title = this.savers['item'] = this.title = new Title(ps, true);
    var link  = this.savers['itemUrl'] = this.link = new Link(ps, true);
    var body  = this.savers['body'] = this.body  = new Body(ps);
    var tags  = this.savers['tags'] = this.tags  = new Tags(ps, true);
    var desc  = this.savers['description'] = this.desc = new Desc(ps, true);
    this.toggles = [title, link, tags, desc];
    body.focus();
    callLater(0.5, Form.resize);
  },
  photo: function(){
    var ps = this.ps;
    var title = this.savers['item'] = this.title = new Title(ps, true);
    var pic   = this.savers['itemUrl'] = this.pic = new Pic(ps);
    var tags  = this.savers['tags'] = this.tags  = new Tags(ps, true);
    var desc  = this.savers['description'] = this.desc = new Desc(ps, true);
    this.toggles = [title, tags, desc];
  },
  regular: function(){
    var ps = this.ps;
    var title = this.savers['item'] = this.title = new Title(ps, true);
    var tags  = this.savers['tags'] = this.tags  = new Tags(ps, true);
    var desc  = this.savers['description'] = this.desc = new Desc(ps);
    this.toggles = [title, tags];
    desc.focus();
    callLater(0.5, Form.resize);
  },
  video: function(){
    var ps = this.ps;
    var title = this.savers['item'] = this.title = new Title(ps);
    var link  = this.savers['itemUrl'] = this.link = new Link(ps, true);
    var tags  = this.savers['tags'] = this.tags  = new Tags(ps, true);
    var desc  = this.savers['description'] = this.desc = new Desc(ps, true);
    this.toggles = [title, tags, link, desc];
    callLater(0.5, Form.resize);
  },
  conversation: function() {
    var ps = this.ps;
    var title = this.savers['item'] = this.title = new Title(ps);
    var link  = this.savers['itemUrl'] = this.link = new Link(ps, true);
    var tags  = this.savers['tags'] = this.tags  = new Tags(ps, true);
    var desc  = this.savers['description'] = this.desc = new Desc(ps, true);
    this.toggles = [title, tags, link, desc];
    callLater(0.5, Form.resize);
  },
  audio: function(){
    var ps = this.ps;
    var title = this.savers['item'] = this.title = new Title(ps);
    var link  = this.savers['itemUrl'] = this.link = new Audio(ps);
    var tags  = this.savers['tags'] = this.tags  = new Tags(ps, true);
    var desc  = this.savers['description'] = this.desc = new Desc(ps, true);
    this.toggles = [title, tags, link, desc];
    callLater(0.5, Form.resize);
  },
  save: function(){
    Object.keys(this.savers).forEach(function(key){
      var body = this.savers[key].body();
      if (key === 'body' && this.ps[key] !== body) {
        delete this.ps['flavors'];
      }
      this.ps[key] = body;
    }, this);
    background.TBRL.Popup.contents[this.ps.itemUrl] = this.ps;
  },
  delete : function(){
    delete background.TBRL.Popup.contents[this.ps.itemUrl];
  },
  post: function(){
    if (this.posters.isPostable()) {
      try{
        this.posted = true;
        this.save();
        if(this.tags) this.tags.addNewTags();
        background.TBRL.Service.post(this.ps, this.posters.body());
        window.close();
      } catch(e) {
        console.log(e);
      }
    }
  },
  cancel: function(){
    this.canceled = true;
    window.close();
  },
  allowHttps: function() {
    this.notify.clear();
    if (this.ps.https.pageUrl[0]) {
      this.ps.pageUrl = this.ps.https.pageUrl[1];
    }
    if (this.ps.https.itemUrl[0]) {
      this.ps.itemUrl = this.ps.https.itemUrl[1];
    }
    this.savers['itemUrl'] && this.savers['itemUrl'].reset(this.ps, true);
    this.savers['tags'] && this.savers['tags'].reset(this.ps, true);
  },
  toggle: function(){
    this.toggles.forEach(function(unit){
      unit.toggle();
    });
    callLater(0.1, Form.resize);
  }
};

Form.shortcutkeys = {
  'ESCAPE': function(ev){
    ev.stop();
    window.close();
  }
};

Form.shortcutkeys[KEY_ACCEL + ' + RETURN'] = function(){
  this.post();
};

Form.resize = function() {
  if(!Form.nowResizing){
    Form.nowResizing = true;
    var root = document.body;
    var height = root.scrollHeight - window.innerHeight;
    var width  = root.scrollWidth  - window.innerWidth;
    window.resizeBy(width, height);
    Form.nowResizing = false;
  } else {
    callLater(0.5, arguments.callee);
  }
};

function Notify(){
  this.msg = $('message');
}

Notify.prototype = {
  constructor: Notify,
  show: function(message, is_element) {
    if (is_element) {
      this.msg.appendChild(message);
    } else {
      this.msg.appendChild($T(message+'\n'));
    }
    addElementClass(this.msg, 'shown');
    callLater(0.5, Form.resize);
  },
  clear: function NotifyClear() {
    var msg = $('message');
    $D(msg);
    removeElementClass(msg, 'shown');
  }
};

function Title(ps, toggle) {
  this.nativeToggle = toggle;
  this.container = $('title');
  toggle && this.container.setAttribute('style', 'display:none !important;');
  var textTitle = this.textTitle = $('title_text');
  var inputTitle = this.inputTitle = $('title_input');
  this.shownInput = false;
  this.shown = true;

  textTitle.appendChild($T(ps.item || ""));
  inputTitle.setAttribute('value', ps.item || "");
  connect(textTitle.parentNode, 'onclick', this, 'showInputTitle');
  connect(inputTitle, 'onblur', this, 'hideInputTitle');
}

Title.prototype = {
  showInputTitle: function(ev){
    if(!this.shownInput){
      this.shownInput = true;
      addElementClass(this.textTitle, 'hide');
      removeElementClass(this.inputTitle, 'hide');
      this.inputTitle.focus();
    }
  },
  hideInputTitle: function(ev){
    if(this.shown && this.shownInput){
      this.shownInput = false;
      $D(this.textTitle);
      this.textTitle.appendChild($T(this.inputTitle.value));
      addElementClass(this.inputTitle, 'hide');
      removeElementClass(this.textTitle, 'hide');
    }
  },
  toggle: function(){
    if(this.shown){
      this.nativeToggle && this.container.removeAttribute('style');
      this.showInputTitle();
      this.shown = !this.shown;
    } else {
      this.nativeToggle && this.container.setAttribute('style', 'display:none !important;');
      this.shown = !this.shown;
      this.hideInputTitle();
    }
  },
  body: function(){
    return this.inputTitle.value;
  }
};

function Link(ps, toggle) {
  this.shown = true;
  this.link = $('link');
  toggle && this.toggle();
  this.link.appendChild(this.linkInput = $N('input', {
    id: 'link_input',
    type: 'text',
    placeholder: 'link',
    autocomplete: 'off',
    value: ps.itemUrl
  }));
}

Link.prototype = {
  body: function(){
    return this.linkInput.value;
  },
  toggle: function(){
    if(this.shown){
      this.link.setAttribute('style', 'display:none');
    } else {
      this.link.removeAttribute('style');
    }
    this.shown = !this.shown;
  },
  reset: function(ps) {
    this.linkInput.value = ps.itemUrl;
  }
};

function Pic(ps, toggle) {
  var self = this;
  this.pic = $('pic');
  this.url = ps.itemUrl || '';
  this.pic.appendChild(this.image = $N('img', {
    'src': ps.fileEntry || ps.itemUrl,
    'alt': ps.item,
    'title': ps.item,
    'class': 'photo_image',
    'id': 'image'
  }));
  this.pic.appendChild(this.size = $N('p', {
    'id': 'size'
  }));
  connect(this.image, 'onload', this.image, function(){
    var width = this.naturalWidth;
    var height = this.naturalHeight;
    var resizedHeight = this.width / width * height;
    if(resizedHeight > 300){
      this.setAttribute('style', 'height:300px !important;width:'+(height/300*width)+' !important;');
      this.setAttribute('style', 'height:300px !important;width:'+(height/300*width)+' !important;');
    }
    self.size.appendChild($T(width + ' × ' + height));
    wait(0).addCallback(function(){
      Form.resize();
    });
  });
}

Pic.prototype = {
  body: function(){
    return this.url;
  },
  toggle: function(){
  },
  reset: function(ps) {
    $D(this.size);
    this.url = ps.itemUrl || '';
    this.image.src = ps.fileEntry || ps.itemUrl;
  }
};

function Audio(ps, toggle) {
  this.url = ps.itemUrl || '';
  if(this.url){
    // tumblr's audio cannot access
    // so url is empty value
    this.au = $('audio');
    this.au.appendChild(this.audio = $N('audio', {
      controls: 'true',
      src     : this.url
    }));
  }
}

Audio.prototype = {
  body: function(){
    return this.url;
  },
  toggle: function(){
  },
  reset: function(ps) {
    this.url = ps.itemUrl;
    this.audio.src = this.url;
  }
};

function Desc(ps, toggle) {
  this.description = $('description');
  this.shown = true;
  toggle && this.toggle();
  this.maxHeight = 100;
  var count = this.count = $('count');
  count.appendChild($T('0'));
  var desc = this.desc = $('desc');

  // unload reset
  if(ps.description){
    desc.value = ps.description;
    count.replaceChild($T(ps.description.length), count.firstChild);
  }
  connect(desc, 'oninput', desc, function(){
    count.replaceChild($T(desc.value.length), count.firstChild);
  });
}

Desc.prototype = {
  body: function(){
    return this.desc.value;
  },
  focus: function(){
    this.desc.focus();
  },
  toggle: function(){
    if(this.shown){
      this.description.setAttribute('style', 'display:none');
    } else {
      this.description.removeAttribute('style');
    }
    this.shown = !this.shown;
  }
};

function Body(ps, toggle) {
  this.container = $('body');
  this.shown = true;
  toggle && this.toggle();
  this.container.appendChild(this.bd = $N('textarea', {
    id: 'bd',
    placeholder: 'quote'
  }));
  this.bd.value = ps.body;
}

Body.prototype = {
  body: function(){
    return this.bd.value;
  },
  focus: function(){
    this.bd.focus();
  },
  toggle: function(){
    if(this.shown){
      this.container.setAttribute('style', 'display:none');
    } else {
      this.container.removeAttribute('style');
    }
    this.shown = !this.shown;
  }
};

function Streams(posters) {
  this.posters = posters;
  var container = this.container = $N('div', {id : 'streams'});
  var selectBox = this.selectBox = $N('select', {
    id    : 'scope',
    name  : 'scope',
    style : 'font-size:1em; width:100%; margin-bottom: 1em;'
  });
  selectBox.appendChild($N('option', {value : ''}, 'Select Google+ Stream (or same as last one)'));
  background.Models['Google+'].getStreams().addCallback(function(streams) {
    for (var i = 0, len = streams.presets.length ; i < len ; i++) {
      var preset = streams.presets[i];
      selectBox.appendChild($N('option', {value : JSON.stringify(preset)}, preset[0].name));
    }
    var optGroup = $N('optgroup', {label : 'Stream'});
    for (var i = 0, len = streams.circles.length ; i < len ; i++) {
      var circle = streams.circles[i];
      optGroup.appendChild($N('option', {value : JSON.stringify(circle)}, circle[0].name));
    }
    selectBox.appendChild(optGroup);
    container.appendChild(selectBox);
    $('widgets').appendChild(container);
    posters.hooks.push(function() {
      if (this.body().some(function(poster) { return poster.name === 'Google+'; })) {
        selectBox.removeAttribute('disabled');
      } else {
        selectBox.setAttribute('disabled', 'true');
      }
    });
    posters.postCheck();
    callLater(0, Form.resize());
  });
}

Streams.prototype = {
  body : function() {
    return this.selectBox.options[this.selectBox.selectedIndex].value;
  }
};

function Posters(ps, form) {
  this.elmPanel = $('posters');
  this.elmButton = $('post');
  this.models = background.Models;
  this.enables = {};
  this.hooks = [];
  this.form = form;

  // enabledPosters could be pre-defined by extractors
  // so, if you check a model is included, use Poster#hasPoster instead
  if (!ps.enabledPosters) {
    ps.enabledPosters = [];
  }

  this.posters = this.models.getEnables(ps);
  var df = $DF();
  var config = Config['services'];
  this.posterItems = this.posters.map(function(poster, index) {
    var posterItem = new PosterItem(ps, poster, index, this);
    df.appendChild(posterItem.element);
    return posterItem;
  }, this);
  this.elmPanel.appendChild(df);
  this.postCheck();
}

Posters.prototype = {
  body: function(){
    return values(this.enables);
  },
  allOff: function(){
    this.posterItems.forEach(methodcaller('off'));
  },
  allOn: function(){
    this.posterItems.forEach(methodcaller('on'));
  },
  isPostable: function() {
    return !!this.body().length;
  },
  postCheck: function() {
    if (this.isPostable()) {
      this.elmButton.removeAttribute('disabled');
    } else {
      this.elmButton.setAttribute('disabled', 'true');
    }
    this.hooks.forEach(function(hook) {
      hook.call(this);
    }, this);
  },
  hasPoster: function(name) {
    return this.posters.some(function(poster) {
      return poster.name === name;
    });
  }
};

function PosterItem(ps, poster, index, posters) {
  this.poster = poster;
  this.posters = posters;
  this.index = index;

  var res = ~ps.enabledPosters.indexOf(poster.name) || posters.models.getConfig(ps, poster) === 'default';
  var img = this.element = $N('img', {'title':poster.name, 'class':'poster'});

  // canvas grayscale
  var id  = connect(img, 'onload', this, function(){
    disconnect(id);
    var canvas = $N('canvas');
    var W = img.naturalWidth;
    var H = img.naturalHeight;
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var imgData = ctx.getImageData(0, 0, W, H);
    W = imgData.width;
    H = imgData.height;
    this.normal = canvas.toDataURL('image/png', '');
    var pxImage = ctx.createImageData(W, H);
    for(var y = 0; y < H; ++y){
      for(var x = 0; x < W; ++x){
        var ptr = (y * W + x) * 4;
        var R = imgData.data[ptr+0];
        var G = imgData.data[ptr+1];
        var B = imgData.data[ptr+2];
        pxImage.data[ptr+0] = pxImage.data[ptr+1] = pxImage.data[ptr+2] = Math.floor( 0.298912 * R + 0.586611 * G + 0.114478 * B );
        pxImage.data[ptr+3] = imgData.data[ptr+3];
      }
    }
    ctx.putImageData(pxImage, 0, 0);
    this.gray = canvas.toDataURL('image/png', '');
    if(this.checked()){
      this.element.src = this.normal;
    } else {
      this.element.src = this.gray;
    }
  });

  img.src = poster.ICON;

  connect(img, 'onclick', this, 'clicked');
  if(index < 9){
    Form.shortcutkeys[KEY_ACCEL+' + '+(index+1)] = this.toggle.bind(this);
    Form.shortcutkeys['ALT + '+(index+1)] = this.quick.bind(this);
  }

  if(res){
    posters.enables[poster.name] = poster;
  } else {
    addElementClass(img, 'disabled');
  }
}

PosterItem.prototype = {
  toggle: function(){
    this.checked()? this.off() : this.on();
    this.posters.postCheck();
  },
  quick: function(ev){
    var that = this;
    stop(ev);
    var posters = this.posters;
    posters.allOff();
    this.toggle();
    setTimeout(function(){ that.posters.form.post(); }, 300);
  },
  checked: function(){
    return !hasElementClass(this.element, 'disabled');
  },
  clicked: function(ev){
    var mod = ev.modifier();
    var mouse = ev.mouse();
    if(mod.alt || mouse.button.middle){
      this.quick(ev);
    } else {
      this.toggle();
    }
  },
  off: function(){
    addElementClass(this.element, 'disabled');
    if (this.gray) {
      this.element.src = this.gray;
    }
    delete this.posters.enables[this.poster.name];
  },
  on: function(){
    removeElementClass(this.element, 'disabled');
    if (this.normal) {
      this.element.src = this.normal;
    }
    this.posters.enables[this.poster.name] = this.poster;
  }
};

function Tags(ps, toggle) {
  this.container = [$('tags'), $('loading_icon'), $('suggestions')];
  this.shown = true;
  toggle && this.toggle();
  var that = this;
  this.candidates = [];
  this.delay = 130;
  this.score = 0.0;
  this.delimiter = ' ';
  this.autoComplete = false;
  this.popup = new Popup(this);
  this.suggestionShown = false;
  this.suggestionIcon  = $('loading_icon');
  this.suggestionShownDefault = background.TBRL.Popup.suggestionShownDefault;
  this.suggestionIconNotConnected = true;
  this.elmTags = {};
  this.ignoreTags = toggle;

  var tags = this.tags = $('tags');
  // unload
  if(ps.tags && ps.tags.length){
    ps.tags.forEach(function(tag){
      this.injectCandidates(tag, true, false);
    }, this);
  }

  if(Config['post']['tag_auto_complete']){
    if(background.TBRL.Popup.candidates){
      this.candidates = background.TBRL.Popup.candidates;
      this.provider   = background.TBRL.Popup.provider;
      this.autoComplete = true;
    }
    if(!this.ignoreTags){
      this.loadSuggestion(ps.itemUrl);
    } else {
      this.suggestionIcon.parentNode.removeChild(this.suggestionIcon);
    }
  } else {
    this.suggestionIcon.parentNode.removeChild(this.suggestionIcon);
  }

  connect(tags, 'oninput', this, function(ev){
    // selectionStart value is not precise
    // defer and take it.
    this.refreshCheck();
    setTimeout(function(){ that.onInput(ev); }, 0);
  });
  connect(tags, 'onterminate', this, 'refreshCheck');
  connect(tags, 'onkeydown', this, function(ev){
    var key = ev.key();
    if(key.string === "KEY_BACKSPACE" || key.string === "KEY_DELETE")
      this.deleting = true;
    if(key.string === "KEY_TAB" && !this.popup.visible)
      return;
    if(this.sleeping){
      ev.preventDefault();
      return;
    }

    if(this.delimiter.charCodeAt() === key.code){
      this.deleting = false;
    }

    switch(key.string){
      case "KEY_TAB":
      case "KEY_ARROW_DOWN":
        ev.preventDefault();
        if(!this.popup.visible)
          this.complete();

        if(this.popup.rowCount === 1){
          this.popup.enter(true);
        } else {
          this.popup.moveCursor(1);
        }
        break;
      case "KEY_ARROW_UP":
        ev.preventDefault();
        this.popup.moveCursor(-1);
        break;
      case "KEY_ENTER":
        if(this.popup.visible){
          this.popup.enter(true);
        }
        break;
    }
  });

  connect(tags, 'onblur', this, function(ev) {
    callLater(0.2, function(){
      that.popup.hidePopup();
    });
  });
  connect(tags, 'onclick', this.popup, 'hidePopup');
}

Tags.prototype = {
  toggle: function(){
    if(this.shown){
      this.container.forEach(function(e){
        e.setAttribute('style', 'display:none');
      });
    } else {
      this.container.forEach(function(e){
        e.removeAttribute('style');
      });
    }
    this.shown = !this.shown;
  },

  loadSuggestion: function(url) {
    var that = this;
    background.Models[Config['post']['tag_provider']]
    .getSuggestions(url)
    .addCallback(function(res){
      that.arrangeSuggestions(res);
      that.setSuggestions(res);
      that.setTags(res.tags);

      removeElementClass(that.suggestionIcon, 'loading');
      addElementClass(that.suggestionIcon, 'loaded');
      if (that.suggestionIconNotConnected) {
        that.suggestionIconNotConnected = false;
        connect(that.suggestionIcon, 'onclick', that, 'toggleSuggestions');
      }
      if (that.suggestionShownDefault) {
        that.openSuggestions();
      }
    }).addErrback(function(e){
      that.notify.show(Config['post']['tag_provider']+'\n'+e.message.indent(4));
      removeElementClass(that.suggestionIcon, 'loading');
      addElementClass(that.suggestionIcon, 'loaded');
    });
  },

  reset: function(ps) {
    if(Config['post']['tag_auto_complete'] && !this.ignoreTags) {
      removeElementClass(this.suggestionIcon, 'loaded');
      addElementClass(this.suggestionIcon, 'loading');
      $D($('suggestions'));
      this.loadSuggestion(ps.itemUrl);
    }
  },

  focus: function(){
    this.tags.focus();
  },

  body: function(){
    return this.values();
  },

  onInput: function(ev){
    this.complete(true);
  },

  values: function(){
    return this.tags.value.split(this.delimiter).filter(function(i) { return i; });
  },

  padding: function(){
    return this._padding || (this._padding = Math.ceil(parseFloat(window.getComputedStyle(this, '').paddingLeft)));
  },

  newWords: function(){
    var check = {};
    this.values().forEach(function(val){
      check[val] = true;
    });
    this.candidates.forEach(function(cand){
      delete check[cand.value];
    });
    var res = [];
    for(var word in check)
      res.push(word);
    return res;
  },

  removeWord: function(word){
    var values = this.values();
    var index = values.indexOf(word);
    if(~index) values.splice(index, 1);
    values = values.join(this.delimiter);
    this.tags.value = values + (values? this.delimiter : '');
  },

  // abbreviation scorer
  scoreFor: function(toscore, abb){
    if(!abb) return 0.9;
    var td = toscore.toLowerCase(), tdLength = toscore.length, pivot = abb.length;
    if(tdLength < pivot) return 0.0;
    var ad = abb.toLowerCase(), ahead, atail, found, score, tail, tail_score, penalty, skipped;
    for(; 0 < pivot; --pivot){
      ahead = ad.substring(0, pivot);
      atail = ad.substring(pivot) || "";
      found = td.indexOf(ahead);
      if(~found){
        tail = toscore.substring(found+pivot) || "";
        tail_score = arguments.callee(tail, atail);
        if(0 < tail_score){
          if(found){
            skipped = toscore.substring(0, found);
            if(/\s$/.test(skipped)){
              var nws = skipped.replace(/\S/, "").length;
              penalty = nws + (skipped.length - nws)*0.15;
            } else if(/^[A-Z]/.test(toscore.substring(found))){
              var nuc = skipped.replace(/[^A-Z]/, "").length;
              penalty = nuc + (skipped.length - nuc)*0.15;
            } else {
              penalty = skipped.length;
            }
          } else {
            penalty = 0;
          }
          score = (found + pivot - penalty + tail_score*tail.length)/tdLength;
        }
      }
      if(score) return score;
    }
    return 0.0;
  },

  injectCandidates: function(cand, terminate, notify){
    notify = (notify===undefined)? terminate : notify;
    var text = this.tags.value;
    var word = this.getCurrentWord();
    var suffix = text.substring(word.caret);
    var delimiter = (terminate && suffix[0] !== this.delimiter)? this.delimiter : '';
    this.tags.value = text.substring(0, word.start) + cand + delimiter + suffix;
    var index = word.start + cand.length + delimiter.length;
    this.tags.setSelectionRange(index, index);
    this.deleting = false;
    if(terminate){
      //this.ensureCursorIsVisible();
      if(notify)
        this.notify();

      var event = document.createEvent('Event');
      event.initEvent('terminate', false, true);
      this.tags.dispatchEvent(event);
    }
  },

  getCurrentWord: function(){
    var text = this.tags.value;
    var caret = this.tags.selectionStart;
    var start = text.lastIndexOf(this.delimiter, caret - 1) + 1;

    return {
      start : start,
      caret : caret,
      hint  : text.substring(start, caret)
    };
  },

  getCandidates: function(hint){
    var cands = [];
    var scoreFor = this.scoreFor;
    function func(reading){
      return scoreFor(reading, hint);
    }
    this.candidates.forEach(function(cand){
      if(cand.reading){
        var score = scoreFor(cand.reading, hint);
      } else {
        var score = Math.max.apply(Math, cand.readings.map(func));
      }
      if(score > this.score)
        cands.push({
          score: score,
          cand : cand
        });
    }, this);
    var values = this.values();

    var index = values.indexOf(hint);
    if(~index) values.splice(index, 1);

    return cands.sort(function(a, b){
      return b.score - a.score;
    }).reduce(function(memo, pair){
      if(pair && !~values.indexOf(pair.cand.value)){
        memo.push(pair.cand);
      }
      return memo;
    }, []);
  },

  complete: function(denyEmpty){
    var text = this.tags.value;
    var word = this.getCurrentWord();
    var hint = word.hint;
    if(!hint && denyEmpty){
      this.popup.hidePopup();
      return;
    }
    var cands = this.getCandidates(hint);
    if(this.autoComplete && !this.deleting && cands.length === 1 && (hint.length >= 2 || cands[0].length === 1)){
      this.injectCandidates(cands[0].value, true);
      this.popup.hidePopup();
      return;
    }
    if(cands.length){
      this.popup.show(null, null, null, cands);
      //this.popup.show(this, (this.getCursorLeft(word.start) - this.content.scrollLeft) + this.padding(), -2, cands);
    } else {
      this.popup.hidePopup();
    }
  },

  getCursorLeft: function(pos){
    this.measure.style.visibility = 'visible';
    $D(this.measure);
    this.measure.appendChild($T(this.tags.value.substring(0, pos)));
    var x = this.measure.getBoundingClientRect();
    //this.measure.style.visibility = 'collapse';
    return x.width;
  },

  ensureCursorIsVisible: function(){
    this.tags.scrollLeft = this.getCursorLeft(this.tags.selectionStart) - this.tags.offsetWidth + 20;
  },

  arrangeSuggestions: function(res){
    var pops = res.popular || [];

    var recos = res.recommended || [];
    var recoTable = recos.reduce(function(memo, i){
      if(i) memo[i.toLowerCase()] = i;
      return memo;
    }, {});

    var tags = (res.tags || []).sort(function(a, b){
      return (b.frequency !== a.frequency)?
        compare(b.frequency, a.frequency) :
        compare(a.name, b.name);
    }).map(itemgetter('name'));
    var tagsTable = tags.reduce(function(memo, i){
      if(i) memo[i.toLowerCase()] = i;
      return memo;
    }, {});

    for(var i = 0, len = pops.length; i < len; ++i){
      var pop = pops[i].toLowerCase();
      if(pop in tagsTable){
        pops.splice(i--, 1);
        len--;

        if(!(pop in recoTable))
          recos.push(tagsTable[pop]);
      }
    }

    res.recommended = recos;
    res.popular = pops;
    res.tags = tags;
  },

  setTags: function(tags){
    var candidates = background.TBRL.Popup.candidates;
    var self = this;
    if ((background.TBRL.Popup.provider &&
         background.TBRL.Popup.provider !== Config['post']['tag_provider']) ||
        (!candidates || !candidates.length)) {
      this.convertToCandidates(tags).addCallback(function(cands){
        self.candidates = cands;
        background.TBRL.Popup.candidates = cands;
        background.TBRL.Popup.provider = Config['post']['tag_provider'];
        self.autoComplete = true;
      });
    } else {
      this.candidates = candidates;
      this.provider   = background.TBRL.Popup.provider;
      this.autoComplete = true;
      return;
    }
  },

  addNewTags: function(){
    var tags = this.newWords();
    if(!tags || !tags.length) return;

    this.convertToCandidates(tags).addCallback(function(newCands){
      var memo = {};
      var cands = [];
      if(!background.TBRL.Popup.candidates){
        background.TBRL.Popup.candidates = [];
      }
      background.TBRL.Popup.candidates.concat(newCands).forEach(function(cand){
        if(memo[cand.value]) return;

        cands.push(cand);
        memo[cand.value] = true;
      });
      background.TBRL.Popup.candidates = cands;
    });
  },

  convertToCandidates: function(tags){
    var source = tags.join(' [');
    if(source.includesFullwidth()){
      return background.Models.Yahoo.getSparseTags(tags, source, ' [');
    } else {
      return succeed().addCallback(function(){
        return tags.map(function(tag){
          return {
            reading : tag,
            value   : tag
          };
        });
      });
    }
  },

  notify: function(){
    // notify => --webkit-transition
    var tags = this.tags;
    tags.style.webkitTransition = '';
    tags.style.backgroundColor = '#ccf0ff';
    setTimeout(function(){
      tags.style.webkitTransition = 'background-color 0.5s ease-out';
      tags.style.backgroundColor = 'white';
    }, 0);

  },

  setSuggestions: function(res){
    var self = this;
    var memo = res.tags.reduce(function(memo, tag){
      if(tag) memo[tag.toUpperCase()] = tag;
      return memo;
    }, {});
    var sg = $('suggestions');
    var df = $DF();
    var suggestions = {};
    ['recommended', 'popular'].forEach(function(prop){
      res[prop].forEach(function(cand){
        var upCand = cand.toUpperCase();
        if(!(upCand in suggestions)){
          suggestions[upCand] = true;
          if(upCand in memo){
            cand = memo[upCand];
            var sug = $N('p', {
              class: 'suggestion listed'
            }, cand);
          } else {
            var sug = $N('p', {
              class: 'suggestion'
            }, cand);
          }
          self.elmTags[cand] = sug;
          connect(sug, 'onclick', cand, function(ev){
            if(hasElementClass(sug, 'used')){
              self.removeWord(cand);
              removeElementClass(sug, 'used');
            } else {
              self.injectCandidates(cand, true);
            }
          });
          df.appendChild(sug);
        }
      });
    });
    sg.appendChild(df);
    this.refreshCheck();
  },

  refreshCheck: function(){
    var self = this;
    var tags = {};

    this.values().forEach(function(tag){
      var elm = self.elmTags[tag];
      if(elm)
        addElementClass(elm, 'used');
      tags[tag] = null;
    });

    items(self.elmTags).forEach(function(pair){
      var tag = pair[0], elm = pair[1];
      if(!(tag in tags))
        removeElementClass(elm, 'used');
    });
  },

  toggleSuggestions: function(){
    return this.suggestionShown ? this.closeSuggestions() : this.openSuggestions();
  },

  openSuggestions: function() {
    var sg = $('suggestions');
    sg.style.display = 'block';
    background.TBRL.Popup.suggestionShownDefault = this.suggestionShown = true;
    addElementClass(this.suggestionIcon, 'extended');
    return callLater(0, Form.resize);
  },

  closeSuggestions: function() {
    var sg = $('suggestions');
    sg.style.display = 'none';
    background.TBRL.Popup.suggestionShownDefault = this.suggestionShown = false;
    removeElementClass(this.suggestionIcon, 'extended');
    return callLater(0, Form.resize);
  }
};

function Popup(tags) {
  this.element = $N('ol', {id:'listbox'});
  this.element.style.visibility = 'hidden';
  $('tag').appendChild(this.element);
  this.rowCount = 0;
  this.visible = false;
  this.tags = tags;
  this.selectedIndex = 0;
  this.cands = [];
}

Popup.prototype = {
  maxRows: 20,
  cloned: $N('li'),
  createItem: function(cand){
    var self = this;
    var clone = this.cloned.cloneNode(false);
    connect(clone, 'onclick', this, function(){
      self.tags.injectCandidates(cand.value, true);
      this.hidePopup();
    });
    clone.setAttribute('title', cand.value);
    clone.appendChild($T(cand.value));
    return clone;
  },

  padding: function(){
    return this._padding ||
      (this._padding = Math.ceil(parseFloat(window.getComputedStyle(this,'').paddingTop)));
  },

  enter: function(terminate){
    var item = this.cands[this.selectedIndex];
    if(!item) return;
    this.tags.injectCandidates(item.value, terminate);

    if(terminate)
      this.hidePopup();
  },

  moveCursor: function(offset){
    var index = this.selectedIndex + offset;
    index = index >= this.rowCount ? 0:
            index < 0              ? (this.rowCount - 1) : index;
    removeElementClass(this.items[this.selectedIndex], "selected");
    this.selectedIndex = index;
    addElementClass(this.items[this.selectedIndex], "selected");
  },

  removeAll: function(){
    $D(this.element);
    this.cands = null;
    this.items = null;
    this.rowCount = 0;
    this.selectedIndex = 0;
  },

  appendItems: function(cands){
    if(cands.length > this.maxRows){
      cands.length = this.maxRows;
    }
    this.cands = cands;
    this.items = cands.map(function(item){
      var li = this.createItem(item);
      this.element.appendChild(li);
      return li;
    }, this);
    this.rowCount = cands.length;
    this.selectedIndex = 0;
    addElementClass(this.items[this.selectedIndex], "selected");
  },

  rowHeight: function(){
    return 10;
    return this._rowHeight ||
     (this._rowHeight = this.element.childNodes[0].boxObject.height);
  },

  hidePopup: function(){
    if(this.visible){
      this.visible = false;
      this.element.style.visibility = 'hidden';
      this.removeAll();
    }
  },

  show: function(anchor, x, y, cands){
    if(cands){
      this.visible = true;
      this.element.style.visibility = 'visible';
      this.removeAll();
      this.appendItems($A(cands));
    }
  }
};
