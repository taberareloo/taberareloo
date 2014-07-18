// -*- coding: utf-8 -*-
/*jshint shadow:true*/
/*global chrome:true, connect:true, queryHash:true, $:true*/
/*global $T:true, keyString:true, $DF:true, $N:true*/
/*global KEY_ACCEL:true, $D:true, methodcaller:true, values:true*/
/*global stop:true, compare:true, itemgetter:true, items:true*/
/*global $A:true, CustomEvent:true, delay:true, defer:true*/
(function (exports) {
  'use strict';

  var background = chrome.extension.getBackgroundPage();
  var form = null;
  var Config  = background.TBRL.Config;
  var isPopup;
  var parentWindowId = null;

  var currentWindowId = null;
  chrome.windows.getCurrent(function (win) {
    currentWindowId = win.id;
  });

  function getPs(query) {
    return new Promise(function (resolve, reject) {
      if (query.quick) {
        // if quick post form, not call getCurrent
        var id = query.id;
        var data = background.TBRL.Popup.data[id];
        var tab = data.tab;
        parentWindowId = tab.windowId;
        var ps = data.ps;
        delete background.TBRL.Popup.data[id];
        setTimeout(function () { resolve(ps); }, 0);
      } else {
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, function (tabs) {
          var tab = tabs[0];
          if (background.TBRL.Service.isEnableSite(tab.url)) {
            if (background.TBRL.Popup.contents[tab.url]) {
              resolve(background.TBRL.Popup.contents[tab.url]);
            } else {
              chrome.tabs.sendMessage(tab.id, {
                request: 'popup',
                content: {
                  title: tab.title,
                  url  : tab.url
                }
              }, function (ps) {
                resolve(ps);
              });
            }
          } else {
            window.close();
          }
        });
      }
    });
  }

  connect(window, 'onDOMContentLoaded', window, function () {
    var query = queryHash(location.search);
    getPs(query).then(function (ps) {
      isPopup = !query.quick;
      background.Patches.loadInPopup(document).then(function () {
        form = new Form(ps);
        document.dispatchEvent(new CustomEvent('popupReady', {
          detail     : form,
          bubbles    : true,
          cancelable : true
        }));
      });
    });
  });

  function Form(ps) {
    this.ps = ps;
    this.posted = false;
    this.canceled = false;
    this.savers = {};
    this.toggles = [];
    this.shown = false;
    this.notify = new Notify();
    // this.shortcutkeys = background.TBRL.Popup.shortcutkeys;

    this.savers.enabledPosters = this.posters = new Posters(ps, this);

    var icon = this.icon = $('typeIcon');
    icon.setAttribute('src', 'skin/' + ps.type + '.png');
    var type = $('type');
    type.appendChild($T(ps.type));

    connect(window, 'onunload', this, function () {
      this.close();
    });

    connect(window, 'onkeydown', this, function (ev) {
      var key = keyString(ev._event);
      var func = Form.shortcutkeys[key];
      if (func) {
        func.call(this, ev);
      }
    });

    connect($('post'), 'onclick', this, 'post');

    var toggle_detail = $('toggle_detail');
    connect(toggle_detail, 'onclick', this, function () {
      if (toggle_detail.classList.contains('extended')) {
        toggle_detail.classList.remove('extended');
      } else {
        toggle_detail.classList.add('extended');
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
      $('icon_container').appendChild(cancel);
    }

    if ((ps.https.pageUrl[0] || ps.https.itemUrl[0]) && !(isPopup && ps.https.pageUrl[1] === ps.pageUrl)) {
      // pageUrl or itemUrl is https
      var list = [];
      if (ps.https.pageUrl[0]) {
        list.push(chrome.i18n.getMessage('warning_https', [ 'PageURL', ps.https.pageUrl[1], ps.pageUrl ]));
      }
      if (ps.https.itemUrl[0]) {
        list.push(chrome.i18n.getMessage('warning_https', [ 'ItemURL', ps.https.itemUrl[1], ps.itemUrl ]));
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

    if (this[ps.type]) {
      this[ps.type]();
    }

    if (this.posters.hasPoster('Pinterest')) {
      this.savers.pinboard = this.pinboards = new Pinboards(this.posters);
    }
  }

  Form.prototype = {
    constructor: Form,
    link: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps);
      this.savers.itemUrl = this.link = new Link(ps, true);
      this.savers.tags = this.tags  = new Tags(ps);
      this.savers.description = this.desc = new Desc(ps);
      this.toggles = [this.title, this.link];
      this.tags.focus();
      // resize timing depends on type.
      // in photo type case, resize timing is when image is loaded
      return delay(0.5).then(Form.resize);
    },
    quote: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps, true);
      this.savers.itemUrl = this.link = new Link(ps, true);
      this.savers.body = this.body  = new Body(ps);
      this.savers.tags = this.tags  = new Tags(ps, true);
      this.savers.description = this.desc = new Desc(ps, true);
      this.toggles = [this.title, this.link, this.tags, this.desc];
      this.body.focus();
      return delay(0.5).then(Form.resize);
    },
    photo: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps, true);
      this.savers.itemUrl = this.pic = new Pic(ps);
      this.savers.tags = this.tags  = new Tags(ps, true);
      this.savers.description = this.desc = new Desc(ps, true);
      this.toggles = [this.title, this.tags, this.desc];
      return defer();
    },
    regular: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps, true);
      this.savers.tags = this.tags  = new Tags(ps, true);
      this.savers.description = this.desc = new Desc(ps);
      this.toggles = [this.title, this.tags];
      this.desc.focus();
      return delay(0.5).then(Form.resize);
    },
    video: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps);
      this.savers.itemUrl = this.link = new Link(ps, true);
      this.savers.tags = this.tags  = new Tags(ps, true);
      this.savers.description = this.desc = new Desc(ps, true);
      this.toggles = [this.title, this.tags, this.link, this.desc];
      return delay(0.5).then(Form.resize);
    },
    conversation: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps);
      this.savers.itemUrl = this.link = new Link(ps, true);
      this.savers.tags = this.tags  = new Tags(ps, true);
      this.savers.description = this.desc = new Desc(ps, true);
      this.toggles = [this.title, this.tags, this.link, this.desc];
      return delay(0.5).then(Form.resize);
    },
    audio: function () {
      var ps = this.ps;
      this.savers.item = this.title = new Title(ps);
      this.savers.itemUrl = this.link = new Audio(ps);
      this.savers.tags = this.tags  = new Tags(ps, true);
      this.savers.description = this.desc = new Desc(ps, true);
      this.toggles = [this.title, this.tags, this.link, this.desc];
      return delay(0.5).then(Form.resize);
    },
    save: function () {
      Object.keys(this.savers).forEach(function (key) {
        var body = this.savers[key].body();
        if (key === 'body' && this.ps[key] !== body) {
          delete this.ps.flavors;
        }
        this.ps[key] = body;
      }, this);
      background.TBRL.Popup.contents[this.ps.https.pageUrl[1]] = this.ps;
    },
    delete : function () {
      delete background.TBRL.Popup.contents[this.ps.https.pageUrl[1]];
    },
    post: function () {
      if (this.posters.isPostable()) {
        try {
          this.posted = true;
          this.save();
          if (this.tags) {
            this.tags.addNewTags();
          }
          background.TBRL.Service.post(this.ps, this.posters.body());
          this.close();
          window.close();
        } catch (e) {
          console.error(e);
        }
      }
    },
    cancel: function () {
      this.canceled = true;
      this.close();
      window.close();
    },
    allowHttps: function () {
      this.notify.clear();
      if (this.ps.https.pageUrl[0]) {
        this.ps.pageUrl = this.ps.https.pageUrl[1];
      }
      if (this.ps.https.itemUrl[0]) {
        this.ps.itemUrl = this.ps.https.itemUrl[1];
      }
      if (this.savers.itemUrl) {
        this.savers.itemUrl.reset(this.ps, true);
      }
      if (this.savers.tags) {
        this.savers.tags.reset(this.ps, true);
      }
    },
    toggle: function () {
      this.toggles.forEach(function (unit) {
        unit.toggle();
      });
      return delay(0.1).then(Form.resize);
    },
    close: function () {
      if (!this.posted && isPopup && !this.canceled) {
        this.save();
      } else {
        this.delete();
      }
      if (!isPopup) {
        chrome.windows.getAll(function (wins) {
          var currentWindow = null;
          var parentWindow  = null;
          for (var i = 0 ; i < wins.length ; i++) {
            if (wins[i].id === parentWindowId) {
              parentWindow = wins[i];
            }
            if (wins[i].id === currentWindowId) {
              currentWindow = wins[i];
            }
          }
          if (currentWindow && parentWindow && (currentWindow.state !== 'fullscreen')) {
            background.localStorage.setItem('popup_position', JSON.stringify({
              top  : window.screenY - parentWindow.top,
              left : window.screenX - parentWindow.left
            }));
          }
        });
      }
    }
  };

  Form.shortcutkeys = {
    'ESCAPE': function (ev) {
      ev.stop();
      this.close();
      window.close();
    }
  };

  Form.shortcutkeys[KEY_ACCEL + ' + 0'] = function () {
    this.posters.allOff();
  };
  Form.shortcutkeys[KEY_ACCEL + ' + DOWN'] = function () {
    var toggle_detail = $('toggle_detail');
    if (!toggle_detail.classList.contains('extended')) {
      toggle_detail.classList.add('extended');
      this.toggle();
    }
  };
  Form.shortcutkeys[KEY_ACCEL + ' + UP'] = function () {
    var toggle_detail = $('toggle_detail');
    if (toggle_detail.classList.contains('extended')) {
      toggle_detail.classList.remove('extended');
      this.toggle();
    }
  };

  Form.shortcutkeys[KEY_ACCEL + ' + RETURN'] = function () {
    this.post();
  };

  Form.resize = function () {
    if (isPopup) {
      return defer();
    }
    if (!Form.nowResizing) {
      Form.nowResizing = true;
      var root = document.body;
      var height = root.scrollHeight - window.innerHeight;
      var width  = root.scrollWidth  - window.innerWidth;
      chrome.windows.getCurrent(function (win) {
        if (win.state !== 'fullscreen') {
          chrome.windows.update(win.id, {
            width  : win.width + width,
            height : win.height + height
          }, function () {
            Form.nowResizing = false;
          });
        } else {
          Form.nowResizing = false;
        }
      });
      return defer();
    }
    return delay(0.5).then(Form.resize);
  };

  function Notify() {
    this.msg = $('message');
  }

  Notify.prototype = {
    constructor: Notify,
    show: function (message, is_element) {
      if (is_element) {
        this.msg.appendChild(message);
      } else {
        this.msg.appendChild($T(message + '\n'));
      }
      this.msg.classList.add('shown');
      return delay(0.5).then(Form.resize);
    },
    clear: function NotifyClear() {
      var msg = $('message');
      $D(msg);
      msg.classList.remove('shown');
    }
  };

  function Title(ps, toggle) {
    this.nativeToggle = toggle;
    this.container = $('title');
    if (toggle) {
      this.container.setAttribute('style', 'display:none !important;');
    }
    var textTitle = this.textTitle = $('title_text');
    var inputTitle = this.inputTitle = $('title_input');
    this.shownInput = false;
    this.shown = true;

    textTitle.appendChild($T(ps.item || ''));
    inputTitle.setAttribute('value', ps.item || '');
    connect(textTitle.parentNode, 'onclick', this, 'showInputTitle');
    connect(inputTitle, 'onblur', this, 'hideInputTitle');
  }

  Title.prototype = {
    constructor: Title,
    showInputTitle: function () {
      if (!this.shownInput) {
        this.shownInput = true;
        this.textTitle.classList.add('hide');
        this.inputTitle.classList.remove('hide');
        this.inputTitle.focus();
      }
    },
    hideInputTitle: function () {
      if (this.shown && this.shownInput) {
        this.shownInput = false;
        $D(this.textTitle);
        this.textTitle.appendChild($T(this.inputTitle.value));
        this.inputTitle.classList.add('hide');
        this.textTitle.classList.remove('hide');
      }
    },
    toggle: function () {
      if (this.shown) {
        if (this.nativeToggle) {
          this.container.removeAttribute('style');
        }
        this.showInputTitle();
        this.shown = !this.shown;
      } else {
        if (this.nativeToggle) {
          this.container.setAttribute('style', 'display:none !important;');
        }
        this.shown = !this.shown;
        this.hideInputTitle();
      }
    },
    body: function () {
      return this.inputTitle.value;
    }
  };

  function Link(ps, toggle) {
    this.shown = true;
    this.link = $('link');
    if (toggle) {
      this.toggle();
    }
    this.link.appendChild(this.linkInput = $N('input', {
      id: 'link_input',
      type: 'text',
      placeholder: 'link',
      autocomplete: 'off',
      value: ps.itemUrl
    }));
  }

  Link.prototype = {
    constructor: Link,
    body: function () {
      return this.linkInput.value;
    },
    toggle: function () {
      if (this.shown) {
        this.link.setAttribute('style', 'display:none');
      } else {
        this.link.removeAttribute('style');
      }
      this.shown = !this.shown;
    },
    reset: function (ps) {
      this.linkInput.value = ps.itemUrl;
    }
  };

  function Pic(ps /*, toggle */) {
    var self = this;
    this.pic = $('pic');
    this.url = ps.itemUrl || '';
    this.pic.appendChild(this.image = $N('img', {
      'src': ps.fileEntry || ps.thumbnailUrl || ps.itemUrl,
      'alt': ps.item,
      'title': ps.item,
      'class': 'photo_image',
      'id': 'image'
    }));
    this.pic.appendChild(this.size = $N('p', {
      'id': 'size'
    }));
    connect(this.image, 'onload', this.image, function () {
      var width = this.naturalWidth;
      var height = this.naturalHeight;
      var resizedHeight = this.width / width * height;
      if (resizedHeight > 300) {
        this.setAttribute('style', 'height:300px !important;width:' + (height / 300 * width) + ' !important;');
        this.setAttribute('style', 'height:300px !important;width:' + (height / 300 * width) + ' !important;');
      }
      var w = ps.originalWidth || width;
      var h = ps.originalHeight || height;
      self.size.appendChild($T(w + ' × ' + h));
      delay(0.3).then(function () {
        Form.resize();
      });
    });
  }

  Pic.prototype = {
    constructor: Pic,
    body: function () {
      return this.url;
    },
    toggle: function () {
    },
    reset: function (ps) {
      $D(this.size);
      this.url = ps.itemUrl || '';
      this.image.src = ps.fileEntry || ps.itemUrl;
    }
  };

  function Audio(ps /*, toggle */) {
    this.url = ps.itemUrl || '';
    if (this.url) {
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
    constructor: Audio,
    body: function () {
      return this.url;
    },
    toggle: function () {
    },
    reset: function (ps) {
      this.url = ps.itemUrl;
      this.audio.src = this.url;
    }
  };

  function Desc(ps, toggle) {
    this.description = $('description');
    this.shown = true;
    if (toggle) {
      this.toggle();
    }
    this.maxHeight = 100;
    var count = this.count = $('count');
    count.appendChild($T('0'));
    var desc = this.desc = $('desc');

    // unload reset
    if (ps.description) {
      desc.value = ps.description;
      count.replaceChild($T(ps.description.length), count.firstChild);
    }

    connect(desc, 'oninput', desc, function () {
      count.replaceChild($T(desc.value.length), count.firstChild);
    });
  }

  Desc.prototype = {
    constructor: Desc,
    body: function () {
      return this.desc.value;
    },
    focus: function () {
      this.desc.focus();
    },
    toggle: function () {
      if (this.shown) {
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
    if (toggle) {
      this.toggle();
    }
    this.container.appendChild(this.bd = $N('textarea', {
      id: 'bd',
      placeholder: 'quote'
    }));
    this.bd.value = ps.body;
  }

  Body.prototype = {
    constructor: Body,
    body: function () {
      return this.bd.value;
    },
    focus: function () {
      this.bd.focus();
    },
    toggle: function () {
      if (this.shown) {
        this.container.setAttribute('style', 'display:none');
      } else {
        this.container.removeAttribute('style');
      }
      this.shown = !this.shown;
    }
  };

  function Pinboards(posters) {
    this.posters = posters;
    var container = this.container = $N('div', {id : 'pinboards'});
    var selectBox = this.selectBox = $N('select', {
      id: 'pinboard',
      name: 'pinboard',
      style: 'font-size:1em; width:100%; margin-bottom: 1em;',
      disabled: 'true'
    }, $N('option', { value: '' }, 'Not seem to log in Pinterest (will check 1m later)'));
    container.appendChild(selectBox);
    $('widgets').appendChild(container);

    var boards = background.Models.Pinterest.getBoards();
    if (boards && boards.length) {
      $D(selectBox);
      for (var i = 0, len = boards.length ; i < len ; i++) {
        var board = boards[i];
        selectBox.appendChild($N('option', {value : board.id}, board.name));
      }
      posters.hooks.push(function () {
        if (this.body().some(function (poster) { return poster.name === 'Pinterest'; })) {
          selectBox.removeAttribute('disabled');
        } else {
          selectBox.setAttribute('disabled', 'true');
        }
      });
      posters.postCheck();
    }
  }

  Pinboards.prototype = {
    constructor: Pinboards,
    body : function () {
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
    this.posterItems = this.posters.map(function (poster, index) {
      var posterItem = new PosterItem(ps, poster, index, this);
      df.appendChild(posterItem.element);
      return posterItem;
    }, this);

    // adding all off button
    var button = $N('button', { id: 'all_off' }, chrome.i18n.getMessage('all_off'));
    df.appendChild(button);
    connect(button, 'onclick', this, 'allOff');

    this.elmPanel.appendChild(df);
    this.postCheck();
  }

  Posters.prototype = {
    constructor: Posters,
    body: function () {
      return values(this.enables);
    },
    allOff: function () {
      this.posterItems.forEach(methodcaller('off'));
      this.postCheck();
    },
    allOn: function () {
      this.posterItems.forEach(methodcaller('on'));
      this.postCheck();
    },
    isPostable: function () {
      return !!this.body().length;
    },
    postCheck: function () {
      if (this.isPostable()) {
        this.elmButton.removeAttribute('disabled');
      } else {
        this.elmButton.setAttribute('disabled', 'true');
      }
      this.hooks.forEach(function (hook) {
        hook.call(this);
      }, this);
    },
    hasPoster: function (name) {
      return this.posters.some(function (poster) { return poster.name === name; });
    }
  };

  function PosterItem(ps, poster, index, posters) {
    this.poster = poster;
    this.posters = posters;
    this.index = index;

    var res = (function () {
      if (~ps.enabledPosters.indexOf(poster)) {
        return true;
      } else if (posters.models.getConfig(ps, poster) === 'default') {
        if (!(isPopup && background.TBRL.Popup.contents[ps.https.pageUrl[1]])) {
          return true;
        }
      }
      return false;
    }());
    var img = this.element = $N('img', { 'src': poster.ICON, 'title': poster.name, 'class': 'poster' });

    connect(img, 'onclick', this, 'clicked');
    if (index < 9) {
      Form.shortcutkeys[KEY_ACCEL + ' + ' + (index + 1)] = this.toggle.bind(this);
      Form.shortcutkeys['ALT + ' + (index + 1)] = this.quick.bind(this);
    }

    if (res) {
      posters.enables[poster.name] = poster;
    } else {
      img.classList.add('disabled');
    }
  }

  PosterItem.prototype = {
    constructor: PosterItem,
    toggle: function () {
      if (this.checked()) {
        this.off();
      } else {
        this.on();
      }
      this.posters.postCheck();
    },
    quick: function (ev) {
      var that = this;
      stop(ev);
      var posters = this.posters;
      posters.allOff();
      this.toggle();
      setTimeout(function () { that.posters.form.post(); }, 300);
    },
    checked: function () {
      return !this.element.classList.contains('disabled');
    },
    clicked: function (ev) {
      var mod = ev.modifier();
      var mouse = ev.mouse();
      if (mod.alt || mouse.button.middle) {
        this.quick(ev);
      } else {
        this.toggle();
      }
    },
    off: function () {
      this.element.classList.add('disabled');
      delete this.posters.enables[this.poster.name];
    },
    on: function () {
      this.element.classList.remove('disabled');
      this.posters.enables[this.poster.name] = this.poster;
    }
  };

  function Tags(ps, toggle) {
    this.container = [$('tags'), $('loading_icon'), $('suggestions')];
    this.shown = true;
    if (toggle) {
      this.toggle();
    }
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
    if (ps.tags && ps.tags.length) {
      ps.tags.forEach(function (tag) {
        this.injectCandidates(tag, true, false);
      }, this);
    }

    if (Config.post.tag_auto_complete) {
      if (background.TBRL.Popup.candidates) {
        this.candidates = background.TBRL.Popup.candidates;
        this.provider   = background.TBRL.Popup.provider;
        this.autoComplete = true;
      }
      if (!this.ignoreTags) {
        this.loadSuggestion(ps.itemUrl);
      } else {
        this.suggestionIcon.parentNode.removeChild(this.suggestionIcon);
      }
    } else {
      this.suggestionIcon.parentNode.removeChild(this.suggestionIcon);
    }

    connect(tags, 'oninput', this, function (ev) {
      // selectionStart value is not precise
      // defer and take it.
      this.refreshCheck();
      setTimeout(function () { that.onInput(ev); }, 0);
    });
    connect(tags, 'onterminate', this, 'refreshCheck');
    connect(tags, 'onkeydown', this, function (ev) {
      var key = ev.key();
      if (key.string === 'KEY_BACKSPACE' || key.string === 'KEY_DELETE') {
        this.deleting = true;
      }
      if (key.string === 'KEY_TAB' && !this.popup.visible) {
        return;
      }
      if (this.sleeping) {
        ev.preventDefault();
        return;
      }

      if (this.delimiter.charCodeAt() === key.code) {
        this.deleting = false;
      }

      switch (key.string) {
      case 'KEY_TAB':
      case 'KEY_ARROW_DOWN':
        ev.preventDefault();
        if (!this.popup.visible) {
          this.complete();
        }

        if (this.popup.rowCount === 1) {
          this.popup.enter(true);
        } else {
          this.popup.moveCursor(1);
        }
        break;
      case 'KEY_ARROW_UP':
        ev.preventDefault();
        this.popup.moveCursor(-1);
        break;
      case 'KEY_ENTER':
        if (this.popup.visible) {
          this.popup.enter(true);
        }
        break;
      }
    });

    connect(tags, 'onblur', this, function () {
      return delay(0.2).then(function () {
        that.popup.hidePopup();
      });
    });
    connect(tags, 'onclick', this.popup, 'hidePopup');
  }

  Tags.prototype = {
    constructor: Tags,
    toggle: function () {
      if (this.shown) {
        this.container.forEach(function (e) {
          e.setAttribute('style', 'display:none');
        });
      } else {
        this.container.forEach(function (e) {
          e.removeAttribute('style');
        });
      }
      this.shown = !this.shown;
    },

    loadSuggestion: function (url) {
      var that = this;
      var model = background.Models[Config.post.tag_provider];
      if (!model) {
        model = background.Models[Config.post.tag_provider = background.TBRL.Popup.defaultSuggester];
      }
      model.getSuggestions(url).then(function (res) {
        that.arrangeSuggestions(res);
        that.setSuggestions(res);
        that.setTags(res.tags);

        that.suggestionIcon.classList.remove('loading');
        that.suggestionIcon.classList.add('loaded');
        if (that.suggestionIconNotConnected) {
          that.suggestionIconNotConnected = false;
          connect(that.suggestionIcon, 'onclick', that, 'toggleSuggestions');
        }
        if (that.suggestionShownDefault) {
          that.openSuggestions();
        }
      }).catch(function (e) {
        that.notify.show(Config.post.tag_provider + '\n' + e.message.indent(4));
        that.suggestionIcon.classList.remove('loading');
        that.suggestionIcon.classList.add('loaded');
      });
    },

    reset: function (ps) {
      if (Config.post.tag_auto_complete && !this.ignoreTags) {
        this.suggestionIcon.classList.remove('loaded');
        this.suggestionIcon.classList.add('loading');
        $D($('suggestions'));
        this.loadSuggestion(ps.itemUrl);
      }
    },

    focus: function () {
      this.tags.focus();
    },

    body: function () {
      return this.values();
    },

    onInput: function () {
      this.complete(true);
    },

    values: function () {
      return this.tags.value.split(this.delimiter).filter(function (i) { return i; });
    },

    padding: function () {
      return this._padding || (this._padding = Math.ceil(parseFloat(window.getComputedStyle(this, '').paddingLeft)));
    },

    newWords: function () {
      var check = {};
      this.values().forEach(function (val) {
        check[val] = true;
      });
      this.candidates.forEach(function (cand) {
        delete check[cand.value];
      });
      var res = [];
      for (var word in check) {
        res.push(word);
      }
      return res;
    },

    removeWord: function (word) {
      var values = this.values();
      var index = values.indexOf(word);
      if (~index) {
        values.splice(index, 1);
      }
      values = values.join(this.delimiter);
      this.tags.value = values + (values ? this.delimiter : '');
    },

    // abbreviation scorer
    scoreFor: function scoreFor(toscore, abb) {
      var td, tdLength, pivot, ad, ahead, atail, found, score, tail, tail_score, penalty, skipped;

      if (!abb) {
        return 0.9;
      }

      td = toscore.toLowerCase();
      tdLength = toscore.length;
      pivot = abb.length;

      if (tdLength < pivot) {
        return 0.0;
      }

      ad = abb.toLowerCase();

      for (; 0 < pivot; --pivot) {
        ahead = ad.substring(0, pivot);
        atail = ad.substring(pivot) || '';
        found = td.indexOf(ahead);
        if (found !== -1) {
          tail = toscore.substring(found + pivot) || '';
          tail_score = scoreFor(tail, atail);
          if (0 < tail_score) {
            if (found) {
              skipped = toscore.substring(0, found);
              if (/\s$/.test(skipped)) {
                var nws = skipped.replace(/\S/, '').length;
                penalty = nws + (skipped.length - nws) * 0.15;
              } else if (/^[A-Z]/.test(toscore.substring(found))) {
                var nuc = skipped.replace(/[^A-Z]/, '').length;
                penalty = nuc + (skipped.length - nuc) * 0.15;
              } else {
                penalty = skipped.length;
              }
            } else {
              penalty = 0;
            }
            score = (found + pivot - penalty + tail_score * tail.length) / tdLength;
          }
        }

        if (score) {
          return score;
        }
      }

      return 0.0;
    },

    injectCandidates: function (cand, terminate, notify) {
      notify = (notify === undefined) ? terminate : notify;
      var text = this.tags.value;
      var word = this.getCurrentWord();
      var suffix = text.substring(word.caret);
      var delimiter = (terminate && suffix[0] !== this.delimiter) ? this.delimiter : '';
      this.tags.value = text.substring(0, word.start) + cand + delimiter + suffix;
      var index = word.start + cand.length + delimiter.length;
      this.tags.setSelectionRange(index, index);
      this.deleting = false;
      if (terminate) {
        //this.ensureCursorIsVisible();
        if (notify) {
          this.notify();
        }
        this.tags.dispatchEvent(new CustomEvent('terminate', {cancelable: true}));
      }
    },

    getCurrentWord: function () {
      var text = this.tags.value;
      var caret = this.tags.selectionStart;
      var start = text.lastIndexOf(this.delimiter, caret - 1) + 1;

      return {
        start : start,
        caret : caret,
        hint  : text.substring(start, caret)
      };
    },

    getCandidates: function (hint) {
      var cands = [];
      var scoreFor = this.scoreFor;
      function func(reading) {
        return scoreFor(reading, hint);
      }
      this.candidates.forEach(function (cand) {
        var score;
        if (cand.reading) {
          score = scoreFor(cand.reading, hint);
        } else {
          score = Math.max.apply(Math, cand.readings.map(func));
        }
        if (score > this.score) {
          cands.push({
            score: score,
            cand : cand
          });
        }
      }, this);
      var values = this.values();

      var index = values.indexOf(hint);
      if (~index) {
        values.splice(index, 1);
      }

      return cands.sort(function (a, b) {
        return b.score - a.score;
      }).reduce(function (memo, pair) {
        if (pair && !~values.indexOf(pair.cand.value)) {
          memo.push(pair.cand);
        }
        return memo;
      }, []);
    },

    complete: function (denyEmpty) {
      var word = this.getCurrentWord();
      var hint = word.hint;
      if (!hint && denyEmpty) {
        this.popup.hidePopup();
        return;
      }
      var cands = this.getCandidates(hint);
      if (this.autoComplete && !this.deleting && cands.length === 1 && (hint.length >= 2 || cands[0].length === 1)) {
        this.injectCandidates(cands[0].value, true);
        this.popup.hidePopup();
        return;
      }
      if (cands.length) {
        this.popup.show(null, null, null, cands);
        //this.popup.show(this, (this.getCursorLeft(word.start) - this.content.scrollLeft) + this.padding(), -2, cands);
      } else {
        this.popup.hidePopup();
      }
    },

    getCursorLeft: function (pos) {
      this.measure.style.visibility = 'visible';
      $D(this.measure);
      this.measure.appendChild($T(this.tags.value.substring(0, pos)));
      var x = this.measure.getBoundingClientRect();
      //this.measure.style.visibility = 'collapse';
      return x.width;
    },

    ensureCursorIsVisible: function () {
      this.tags.scrollLeft = this.getCursorLeft(this.tags.selectionStart) - this.tags.offsetWidth + 20;
    },

    arrangeSuggestions: function (res) {
      var pops = res.popular || [];

      var recos = res.recommended || [];
      var recoTable = recos.reduce(function (memo, i) {
        if (i) {
          memo[i.toLowerCase()] = i;
        }
        return memo;
      }, {});

      var tags = (res.tags || []).sort(function (a, b) {
        return (b.frequency !== a.frequency) ? compare(b.frequency, a.frequency) : compare(a.name, b.name);
      }).map(itemgetter('name'));
      var tagsTable = tags.reduce(function (memo, i) {
        if (i) {
          memo[i.toLowerCase()] = i;
        }
        return memo;
      }, {});

      for (var i = 0, len = pops.length; i < len; ++i) {
        var pop = pops[i].toLowerCase();
        if (pop in tagsTable) {
          pops.splice(i--, 1);
          len--;

          if (!(pop in recoTable)) {
            recos.push(tagsTable[pop]);
          }
        }
      }

      res.recommended = recos;
      res.popular = pops;
      res.tags = tags;
    },

    setTags: function (tags) {
      var candidates = background.TBRL.Popup.candidates;
      var self = this;
      if ((background.TBRL.Popup.provider &&
           background.TBRL.Popup.provider !== Config.post.tag_provider) ||
          (!candidates || !candidates.length)) {
        this.convertToCandidates(tags).then(function (cands) {
          self.candidates = cands;
          background.TBRL.Popup.candidates = cands;
          background.TBRL.Popup.provider = Config.post.tag_provider;
          self.autoComplete = true;
        });
      } else {
        this.candidates = candidates;
        this.provider   = background.TBRL.Popup.provider;
        this.autoComplete = true;
        return;
      }
    },

    addNewTags: function () {
      var tags = this.newWords();
      if (!tags || !tags.length) {
        return;
      }

      this.convertToCandidates(tags).then(function (newCands) {
        var memo = {};
        var cands = [];
        if (!background.TBRL.Popup.candidates) {
          background.TBRL.Popup.candidates = [];
        }
        background.TBRL.Popup.candidates.concat(newCands).forEach(function (cand) {
          if (memo[cand.value]) {
            return;
          }

          cands.push(cand);
          memo[cand.value] = true;
        });
        background.TBRL.Popup.candidates = cands;
      });
    },

    convertToCandidates: function (tags) {
      var source = tags.join(' [');
      if (source.includesFullwidth()) {
        return background.Models.Yahoo.getSparseTags(tags, source, ' [');
      } else {
        return Promise.resolve(tags.map(function (tag) {
          return {
            reading : tag,
            value   : tag
          };
        }));
      }
    },

    notify: function () {
      // notify => -transition
      var tags = this.tags;
      tags.style.transition = '';
      tags.style.backgroundColor = '#ccf0ff';
      setTimeout(function () {
        tags.style.transition = 'background-color 0.5s ease-out';
        tags.style.backgroundColor = 'white';
      }, 0);

    },

    setSuggestions: function (res) {
      var self = this;
      var memo = res.tags.reduce(function (memo, tag) {
        if (tag) {
          memo[tag.toUpperCase()] = tag;
        }
        return memo;
      }, {});
      var sg = $('suggestions');
      var df = $DF();
      var suggestions = {};
      ['recommended', 'popular'].forEach(function (prop) {
        res[prop].forEach(function (cand) {
          var upCand = cand.toUpperCase();
          var sug;
          if (!(upCand in suggestions)) {
            suggestions[upCand] = true;
            if (upCand in memo) {
              cand = memo[upCand];
              sug = $N('p', {
                class: 'suggestion listed'
              }, cand);
            } else {
              sug = $N('p', {
                class: 'suggestion'
              }, cand);
            }
            self.elmTags[cand] = sug;
            connect(sug, 'onclick', cand, function () {
              if (sug.classList.contains('used')) {
                self.removeWord(cand);
                sug.classList.remove('used');
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

    refreshCheck: function () {
      var self = this;
      var tags = {};

      this.values().forEach(function (tag) {
        var elm = self.elmTags[tag];
        if (elm) {
          elm.classList.add('used');
        }
        tags[tag] = null;
      });

      items(self.elmTags).forEach(function (pair) {
        var tag = pair[0], elm = pair[1];
        if (!(tag in tags)) {
          elm.classList.remove('used');
        }
      });
    },

    toggleSuggestions: function () {
      return this.suggestionShown ? this.closeSuggestions() : this.openSuggestions();
    },

    openSuggestions: function () {
      var sg = $('suggestions');
      sg.style.display = 'block';
      background.TBRL.Popup.suggestionShownDefault = this.suggestionShown = true;
      this.suggestionIcon.classList.add('extended');
      return defer().then(Form.resize);
    },

    closeSuggestions: function () {
      var sg = $('suggestions');
      sg.style.display = 'none';
      background.TBRL.Popup.suggestionShownDefault = this.suggestionShown = false;
      this.suggestionIcon.classList.remove('extended');
      return defer().then(Form.resize);
    }
  };

  function Popup(tags) {
    this.element = $N('ol', { id: 'listbox' });
    this.element.style.visibility = 'hidden';
    $('tag').appendChild(this.element);
    this.rowCount = 0;
    this.visible = false;
    this.tags = tags;
    this.selectedIndex = 0;
    this.cands = [];
  }

  Popup.prototype = {
    constructor: Popup,
    maxRows: 20,
    cloned: $N('li'),
    createItem: function (cand) {
      var self = this;
      var clone = this.cloned.cloneNode(false);
      connect(clone, 'onclick', this, function () {
        self.tags.injectCandidates(cand.value, true);
        this.hidePopup();
      });
      clone.setAttribute('title', cand.value);
      clone.appendChild($T(cand.value));
      return clone;
    },

    padding: function () {
      return this._padding ||
        (this._padding = Math.ceil(parseFloat(window.getComputedStyle(this, '').paddingTop)));
    },

    enter: function (terminate) {
      var item = this.cands[this.selectedIndex];
      if (!item) {
        return;
      }
      this.tags.injectCandidates(item.value, terminate);

      if (terminate) {
        this.hidePopup();
      }
    },

    moveCursor: function (offset) {
      var index = this.selectedIndex + offset;
      index = index >= this.rowCount ? 0:
              index < 0              ? (this.rowCount - 1) : index;
      this.items[this.selectedIndex].classList.remove('selected');
      this.selectedIndex = index;
      this.items[this.selectedIndex].classList.add('selected');
    },

    removeAll: function () {
      $D(this.element);
      this.cands = null;
      this.items = null;
      this.rowCount = 0;
      this.selectedIndex = 0;
    },

    appendItems: function (cands) {
      if (cands.length > this.maxRows) {
        cands.length = this.maxRows;
      }
      this.cands = cands;
      this.items = cands.map(function (item) {
        var li = this.createItem(item);
        this.element.appendChild(li);
        return li;
      }, this);
      this.rowCount = cands.length;
      this.selectedIndex = 0;
      this.items[this.selectedIndex].classList.add('selected');
    },

    rowHeight: function () {
      return 10;
      // return this._rowHeight || (this._rowHeight = this.element.childNodes[0].boxObject.height);
    },

    hidePopup: function () {
      if (this.visible) {
        this.visible = false;
        this.element.style.visibility = 'hidden';
        this.removeAll();
      }
    },

    show: function (anchor, x, y, cands) {
      if (cands) {
        this.visible = true;
        this.element.style.visibility = 'visible';
        this.removeAll();
        this.appendItems($A(cands));
      }
    }
  };

  exports.Form = Form;
  exports.Title = Title;
  exports.Audio = Audio;
  exports.Body = Body;
  exports.Desc = Desc;
  exports.Link = Link;
  exports.Pic = Pic;
  exports.Notify = Notify;
  exports.Pinboards = Pinboards;
  exports.Posters = Posters;
  exports.PosterItem = PosterItem;
  exports.Tags = Tags;
  exports.Popup = Popup;
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
