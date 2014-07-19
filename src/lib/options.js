/*global chrome:true, connect:true, $:true, $A:true, $T:true, $DF:true*/
/*global $N:true, disconnect:true, keyString:true, $D:true, update:true*/
/*global CustomEvent:true, zip:true, MouseEvent:true, promiseAllHash:true*/
(function (exports) {
  'use strict';

  var background = chrome.extension.getBackgroundPage();
  var Config     = background.TBRL.Config;

  connect(document, 'onDOMContentLoaded', document, function () {
    background.Patches.loadInOptions(document).then(function () {
      var options = new Options();
      document.dispatchEvent(new CustomEvent('optionsReady', {
        detail     : options,
        bubbles    : true,
        cancelable : true
      }));
    });
  });

  function Options() {
    var self = this;
   // smoothing slide
    var inner = $('inner');
    this.slides = ['services', 'post', 'entry', 'patch', 'backup', 'about'];
    this.tabs = $A(document.getElementsByClassName('tab'));
    this.now_active = 0;
    this.tabs[this.now_active].classList.add('active');
    this.tabs.forEach(function (li) {
      var p = li.getElementsByTagName('p')[0];
      var anchor = p.className;
      connect(li, 'onclick', li, function () {
        self.tabs[self.now_active].classList.remove('active');
        var index = self.slides.indexOf(anchor);
        if (~index) {
          self.now_active = index;
          self.tabs[self.now_active].classList.add('active');
          inner.style.marginLeft = (-index) * 100 + '%';
        }
      });
    });

    this.setLabels();

    // services
    this.services = new Services();
    // tag provider
    this.provider = new Provider();
    // tag auto complete
    this.tag_check = new Check('tag_auto_complete', !!Config.post.tag_auto_complete);
    // notification on posting
    this.notification_check = new Check('notification_on_posting', !!Config.post.notification_on_posting);
    // check https
    this.check_https_check = new Check('check_https', !!Config.post.check_https);
    // LDR + Taberareloo
    this.ldr_check = new Check('ldr_plus_taberareloo', !!Config.post.ldr_plus_taberareloo);
    this.ldr_short = new Shortcutkey('shortcutkey_ldr_plus_taberareloo', true, function (key) {
      return Shortcutkey.keyString2LDR(key);
    });
    // Dashboard + Taberareloo
    this.disable_keybind_check = new Check('disable_tumblr_default_keybind', !!Config.post.disable_tumblr_default_keybind);
    this.dashboard_check = new Check('dashboard_plus_taberareloo', !!Config.post.dashboard_plus_taberareloo);
    this.dashboard_short = new Shortcutkey('shortcutkey_dashboard_plus_taberareloo', true);
    this.dashboard_manually_check = new Check('dashboard_plus_taberareloo_manually', !!Config.post.dashboard_plus_taberareloo_manually);
    this.dashboard_manually_short = new Shortcutkey('shortcutkey_dashboard_plus_taberareloo_manually', true);

    // Play on Tumblr - Play
    this.play_play_check = new Check('play_on_tumblr_play', !!Config.post.play_on_tumblr_play);
    this.play_play_short = new Shortcutkey('shortcutkey_play_on_tumblr_play', true);

    // Play on Tumblr - Like
    this.play_like_check = new Check('play_on_tumblr_like', !!Config.post.play_on_tumblr_like);
    this.play_like_short = new Shortcutkey('shortcutkey_play_on_tumblr_like', true);

    // Play on Tumblr - Count
    this.play_count_check = new Check('play_on_tumblr_count', !!Config.post.play_on_tumblr_count);
    this.play_count_short = new Shortcutkey('shortcutkey_play_on_tumblr_count', true);

    // Post with Queue
    this.queue_check = new Check('post_with_queue', !!Config.post.post_with_queue);
    // Post with Queue
    this.not_queue_reblog_post_check = new Check('not_queue_reblog_post', !!Config.post.not_queue_reblog_post);
    if (!this.queue_check.body()) {
      $('not_queue_reblog_post_checkbox').disabled = true;
    }
    $('post_with_queue_checkbox').addEventListener('change', function () {
      $('not_queue_reblog_post_checkbox').disabled = !$('not_queue_reblog_post_checkbox').disabled;
    });

    // Shorten URL
    this.shorten_check = new Check('always_shorten_url', !!Config.post.always_shorten_url);
    // Evernote - Clip Full Page
    this.clip_fullpage = new Check('evernote_clip_fullpage', !!Config.post.evernote_clip_fullpage);
    // Quote - Remove Hatena Keywords
    this.remove_hatena_keyword = new Check('remove_hatena_keyword', !!Config.post.remove_hatena_keyword);
    // Evernote - Quote - Post Tumblr with Plain Text
    this.tumblr_default_quote = new Check('tumblr_default_quote', !!Config.post.tumblr_default_quote);
    // multiple tumblelogs
    this.tumble_check = new Check('multi_tumblelogs', !!Config.post.multi_tumblelogs);
    this.tumble_list = new TumbleList();

    // HatenaBlog
    this.enableHatenaBlog_check = new Check('enableHatenaBlog', !!Config.post.enable_hatenablog);
    this.hatenaBlog_list = new HatenaBlogList();

    // WebHook
    this.enable_webhook_check = new Check('enable_webhook', !!Config.post.enable_webhook);
    this.webhook_url_input = new Input('webhook_url', Config.post.webhook_url);

    // amazon affiliate id
    this.amazon = new Input('amazon_affiliate_id', Config.entry.amazon_affiliate_id);
    // thumbnail template
    this.thumbnail = new TemplateInput('thumbnail_template');
    // twitter template
    this.twittemp = new TemplateInput('twitter_template');
    // trim reblog info
    this.reblog_check = new Check('trim_reblog_info', !!Config.entry.trim_reblog_info);
    // trim reblog info
    this.append_check = new Check('append_content_source', !!Config.entry.append_content_source);
    // notconvert to Text
    this.notconvert_check = new Check('not_convert_text', !!Config.entry.not_convert_text);
    // tumblr2twitter
    this.tumblr2twitter = new Check('tumblr2twitter', !!Config.entry.tumblr2twitter);
    // tumblr2facebook
    this.tumblr2facebook = new Check('tumblr2facebook', !!Config.entry.tumblr2facebook);
    // keyconfig
    this.keyconfig_check = new Check('keyconfig', !!Config.post.keyconfig);
    // shortcutkey quick link post
    this.link_quick_short = new Shortcutkey('shortcutkey_linkquickpost', true);
    // shortcutkey quick link post
    this.quote_quick_short = new Shortcutkey('shortcutkey_quotequickpost', true);

    connect($('save'), 'onclick', this, this.save);

    // patches
    initPatches();

    // backup/restor
    initBackup();
  }

  Options.prototype = {
    setLabels : function () {
      // i18n
      $('label_services').appendChild($T(chrome.i18n.getMessage('label_postConfig')));
      $('label_post').appendChild($T(chrome.i18n.getMessage('label_post')));
      $('label_entry').appendChild($T(chrome.i18n.getMessage('label_entry')));
      $('label_patch').appendChild($T(chrome.i18n.getMessage('label_patch')));
      $('label_backup').appendChild($T(chrome.i18n.getMessage('label_backup')));
      $('label_about').appendChild($T(chrome.i18n.getMessage('label_about')));
      $('label_tagprovider').appendChild($T(chrome.i18n.getMessage('label_tagprovider')));
      $('label_keyconfig').appendChild($T(chrome.i18n.getMessage('label_keyconfig')));

      $('label_shortcutkey_linkquickpost').appendChild($T(chrome.i18n.getMessage('label_shortcutkey', 'Link')));
      $('label_shortcutkey_quotequickpost').appendChild($T(chrome.i18n.getMessage('label_shortcutkey', 'Quote')));

      $('shortcutkey_linkquickpost_clear').value =
        $('shortcutkey_quotequickpost_clear').value =
        $('shortcutkey_ldr_plus_taberareloo_clear').value =
        $('shortcutkey_dashboard_plus_taberareloo_clear').value =
        $('shortcutkey_dashboard_plus_taberareloo_manually_clear').value =
        $('shortcutkey_play_on_tumblr_play_clear').value =
        $('shortcutkey_play_on_tumblr_like_clear').value =
        $('shortcutkey_play_on_tumblr_count_clear').value = chrome.i18n.getMessage('label_clear');

      $('label_tagAutoComplete').appendChild($T(chrome.i18n.getMessage('label_tagAutoComplete')));
      $('label_notificationOnPosting').appendChild($T(chrome.i18n.getMessage('label_notificationOnPosting')));
      $('label_checkHttps').appendChild($T(chrome.i18n.getMessage('label_checkHttps')));
      $('label_postWithQueue').appendChild($T(chrome.i18n.getMessage('label_postWithQueue')));
      $('label_notQueueReblogPost').appendChild($T(chrome.i18n.getMessage('label_notQueueReblogPost')));
      $('label_alwaysShortenURL').appendChild($T(chrome.i18n.getMessage('label_alwaysShortenURL')));
      $('label_clipFullPage').appendChild($T(chrome.i18n.getMessage('label_clipFullPage')));
      $('label_removeHatenaKeyword').appendChild($T(chrome.i18n.getMessage('label_removeHatenaKeyword')));
      $('label_tumblrDefaultQuote').appendChild($T(chrome.i18n.getMessage('label_tumblrDefaultQuote')));
      $('label_userscripts').appendChild($T(chrome.i18n.getMessage('label_userscripts')));
      $('label_multipleTumblelog').appendChild($T(chrome.i18n.getMessage('label_multipleTumblelog')));
      $('label_enableMultipleTumblelog').appendChild($T(chrome.i18n.getMessage('label_enable')));
      $('multi_tumblelogs_button').value = chrome.i18n.getMessage('label_get');

      // HatenaBlog
      $('label_HatenaBlog').appendChild(
        $T(chrome.i18n.getMessage('label_HatenaBlog'))
      );
      $('label_enableHatenaBlog').appendChild(
        $T(chrome.i18n.getMessage('label_enable'))
      );
      $('getHatenaBlog_button').value = chrome.i18n.getMessage('label_get');

      // WebHook
      $('label_enable_webhook').appendChild($T(chrome.i18n.getMessage('label_enable')));

      $('label_amazonAffiliateId').appendChild($T(chrome.i18n.getMessage('label_amazonAffiliateId')));
      $('label_thumbnailTemplate').appendChild($T(chrome.i18n.getMessage('label_thumbnailTemplate')));
      $('label_twitterTemplate').appendChild($T(chrome.i18n.getMessage('label_twitterTemplate')));
      $('label_trimReblogInfo').appendChild($T(chrome.i18n.getMessage('label_trimReblogInfo')));
      $('label_appendContentSource').appendChild($T(chrome.i18n.getMessage('label_appendContentSource')));
      $('label_notconvertText').appendChild($T(chrome.i18n.getMessage('label_notconvertText')));
      $('label_tumblr2twitter').appendChild($T(chrome.i18n.getMessage('label_tumblr2twitter')));
      $('label_tumblr2facebook').appendChild($T(chrome.i18n.getMessage('label_tumblr2facebook')));
      $('label_example').appendChild($T(chrome.i18n.getMessage('label_example')));
      $('save').value = chrome.i18n.getMessage('label_save');
    },
    save : function () {
      var lk = this.link_quick_short.body();
      var qk = this.quote_quick_short.body();
      var tcheck = this.tumble_check.body();
      var enable_hatenablog = this.enableHatenaBlog_check.body();
      var enable_webhook = this.enable_webhook_check.body();
      var webhook_url = this.webhook_url_input.body();
      if (!Shortcutkey.isConflict(lk, qk)) {
        background.TBRL.configSet({
          'services' : this.services.body(),
          'post'     : {
            'tag_provider'     : this.provider.body(),
            'tag_auto_complete': this.tag_check.body(),
            'notification_on_posting': this.notification_check.body(),
            'check_https': this.check_https_check.body(),
            'ldr_plus_taberareloo': this.ldr_check.body(),
            'disable_tumblr_default_keybind': this.disable_keybind_check.body(),
            'dashboard_plus_taberareloo': this.dashboard_check.body(),
            'dashboard_plus_taberareloo_manually': this.dashboard_manually_check.body(),
            'play_on_tumblr_play': this.play_play_check.body(),
            'play_on_tumblr_like': this.play_like_check.body(),
            'play_on_tumblr_count': this.play_count_check.body(),
            'shortcutkey_ldr_plus_taberareloo'  : this.ldr_short.body(),
            'shortcutkey_dashboard_plus_taberareloo'  : this.dashboard_short.body(),
            'shortcutkey_dashboard_plus_taberareloo_manually'  : this.dashboard_manually_short.body(),
            'shortcutkey_play_on_tumblr_play'  : this.play_play_short.body(),
            'shortcutkey_play_on_tumblr_like'  : this.play_like_short.body(),
            'shortcutkey_play_on_tumblr_count' : this.play_count_short.body(),
            'keyconfig' : this.keyconfig_check.body(),
            'evernote_clip_fullpage': this.clip_fullpage.body(),
            'remove_hatena_keyword' : this.remove_hatena_keyword.body(),
            'tumblr_default_quote'  : this.tumblr_default_quote.body(),
            'shortcutkey_linkquickpost': lk,
            'shortcutkey_quotequickpost' : qk,
            'always_shorten_url' : this.shorten_check.body(),
            'multi_tumblelogs'   : tcheck,
            'post_with_queue'    : this.queue_check.body(),
            'not_queue_reblog_post': this.not_queue_reblog_post_check.body(),
            'enable_hatenablog' : enable_hatenablog,
            'enable_webhook' : enable_webhook,
            'webhook_url' : webhook_url
          },
          'entry'    : {
            'amazon_affiliate_id' : this.amazon.body(),
            'thumbnail_template' : this.thumbnail.body(),
            'twitter_template' : this.twittemp.body(),
            'trim_reblog_info'   : this.reblog_check.body(),
            'append_content_source'   : this.append_check.body(),
            'not_convert_text'   : this.notconvert_check.body(),
            'tumblr2twitter'   : this.tumblr2twitter.body(),
            'tumblr2facebook'   : this.tumblr2facebook.body()
          }
        });
        if (!tcheck) {
          this.tumble_list.remove();
        }
        if (enable_webhook && webhook_url) {
          background.Models.addWebHooks();
        } else {
          background.Models.removeWebHooks();
        }
        if (!enable_hatenablog) {
          background.Models.removeHatenaBlogs();
        }
        chrome.runtime.sendMessage({request: 'initialize'});
        window.close();
      } else {
        alert(chrome.i18n.getMessage('error_keyConfliction'));
      }
    }
  };

  function Services() {
    var self = this;
    this.all = [];
    var configs = Config.services || {};

    background.Models.values.forEach(function (model) {
      if (!model.check) {
        return;
      }

      var row = [model.name];
      row.icon = model.ICON;
      row.link = model.LINK;
      var config = configs[model.name] || {};
      Services.TYPES.forEach(function (type) {
        var postable = (type === 'favorite') ? !!model.favor : model.check({
          type: type,
          pageUrl: {
            match : function () { return true; }
          }
        });
        row.push(config[type] || (postable ? 'enabled' : null));
      });
      self.all.push(row);
    });

    var tbody = $('service_body');
    var df = $DF();
    this.elements = {};
    var table = $('service_table');
    var dragger = new Dragger();

    this.all.forEach(function (service) {
      var icon = service.icon;
      var link = service.link;
      var servicename;
      service = $A(service);
      servicename = service[0];
      self.elements[servicename] = {};
      var children = [];
      if (link) {
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
      }, service[0] + ''));
      service[0] = $N('td', null, children);
      var ELMS = Services.ELMS;

      function createService(status, index) {
        if (status) {
          var container = ELMS.container.cloneNode(false);
          var button = ELMS[status].cloneNode(false);
          container.appendChild(button);
          service[index] = $N('td', null, [container]);
          self.elements[servicename][Services.TYPES[index - 1]] = button;
          connect(service[index], 'onclick', service[index], function () {
            button.classList.remove(status);
            if (status === 'enabled') {
              status = 'disabled';
            } else if (status === 'disabled') {
              status = 'default';
            } else {
              status = 'enabled';
            }
            button.classList.add(status);
          });
          dragger.register(container, {
            start: function () {
              this.status = status;
              table.classList.remove('normal');
              table.classList.add(status);
            },
            end:   function () {
              this.status = null;
              table.classList.remove(status);
              table.classList.add('normal');
            }
          });
          dragger.dragging(container, function () {
            if (this.src !== container) {
              status = this.status;
              button.setAttribute('class', 'button ' + status);
            }
          });
        } else {
          self.elements[servicename][Services.TYPES[index - 1]] = null;
          service[index] = $N('td');
        }
      }

      for (var i = 1, len = service.length; i < len; ++i) {
        createService(service[i], i);
      }
      var tr = $N('tr', {
        class: 'service',
        id: servicename
      }, service);
      df.appendChild(tr);
    });
    tbody.appendChild(df);
  }

  Services.TYPES = ['regular', 'photo', 'quote', 'link', 'video', 'audio', 'conversation', 'favorite'];

  Services.ELMS = {
    'container': $N('div', {
      class: 'button_container'
    }),
    'enabled': $N('div', {
      class: 'button enabled'
    }),
    'disabled': $N('div', {
      class: 'button disabled'
    }),
    'default': $N('div', {
      class: 'button default'
    })
  };

  Services.prototype = {
    body: function () {
      var result = {};
      var self = this;
      Object.keys(self.elements).forEach(function (name) {
        var val = self.elements[name];
        result[name] = {};
        Services.TYPES.forEach(function (type) {
          if (val[type]) {
            var button = val[type];
            if (button.classList.contains('enabled')) {
              result[name][type] = 'enabled';
            } else if (button.classList.contains('disabled')) {
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

  function Provider() {
    var self = this;
    this.provider = Config.post.tag_provider;
    this.radioboxes = [];
    background.Models.values.forEach(function (model) {
      if (model.getSuggestions) {
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
  }

  Provider.prototype = {
    body: function () {
      var result = '';
      this.radioboxes.some(function (radio) {
        if (radio.checked) {
          result = radio.value;
          return true;
        }
        return false;
      });
      return result;
    }
  };

  function Check(name, checked) {
    this.check = $(name + '_checkbox');
    this.check.checked = checked;
  }

  Check.prototype = {
    body: function () {
      return this.check.checked;
    }
  };

  function Input(name, def) {
    this.input = $(name + '_input');
    if (def) {
      this.input.value = def;
    }
  }

  Input.prototype = {
    body: function () {
      return this.input.value;
    }
  };

  // Chrome 6 does'nt implement event#dataTransfer#setDragImage
  // so now, implement dragger by the legacy way such as mouseover etc.
  function Dragger() {
    this.src = null;
  }

  Dragger.prototype = {
    register: function dragger_register(target, obj) {
      var that = this;
      connect(target, 'onmousedown', target, function (ev) {
        ev.stop();
        that.src = target;
        var sig = connect(document, 'onmouseup', document, function (ev) {
          disconnect(sig);
          obj.end.call(that, ev);
          that.src = null;
        });
        obj.start.call(that, ev);
      }, false);
    },
    dragging: function dragger_dragging(target, func) {
      var that = this;
      connect(target, 'onmouseover', target, function (ev) {
        if (that.src) {
          func.call(that, ev);
        }
      });
    }
  };

  function TemplateInput(id) {
    this.input = $(id);
    this.input.value = Config.entry[id];
  }

  TemplateInput.prototype = {
    body: function () {
      return this.input.value;
    }
  };

  function Shortcutkey(name, meta, filter) {
    var elm = this.elm = $(name);
    var clear = $(name + '_clear');
    this.config = Config.post[name] || '';
    elm.value = this.config;
    connect(elm, 'onkeydown', elm, function (ev) {
      var key = keyString(ev._event);
      switch (key) {
      case 'TAB':
      case 'SHIFT + TAB':
        return;
      }
      ev.stop();
      if (filter && !filter(key)) {
        return;
      }
      elm.value =
        (key === 'ESCAPE') ? ''  :
        (meta) ? key : key.split(' + ').pop();
    });
    connect(clear, 'onclick', clear, function () {
      elm.value = '';
    });
  }

  Shortcutkey.isConflict = function () {
    var keys = $A(arguments);
    var set = [];
    for (var i = 0, len = keys.length; i < len; ++i) {
      if (keys[i]) {
        if (~set.indexOf(keys[i])) {
          return true;
        } else {
          set.push(keys[i]);
        }
      }
    }
    return false;
  };

  Shortcutkey.prototype = {
    body: function () {
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

  Shortcutkey.keyString2LDR = function (key) {
    var arr = key.split(' + ');
    var memo = {};
    var res = null;
    ['META', 'CTRL', 'SHIFT', 'ALT'].forEach(function (k) {
      memo[k] = !!~arr.indexOf(k);
    });
    memo.KEY = arr.last();
    if (memo.META || memo.ALT) {
      return null;
    }
    if (memo.KEY in this.specials) {
      if (!(memo.SHIFT || memo.CTRL)) {
        return this.specials[memo.KEY];
      } else {
        return null;
      }
    }
    if (memo.KEY in this.defs) {
      memo.KEY = this.defs[memo.KEY];
      if (memo.SHIFT) {
        res = memo.KEY.toUpperCase();
      } else {
        res = memo.KEY.toLowerCase();
      }
      if (memo.CTRL) {
        res = 'ctrl+' + res;
      }
    }
    return res;
  };

  function TumbleList() {
    var self = this;
    this.field = $('multi_tumble_field');
    this.button = $('multi_tumblelogs_button');
    connect(this.button, 'onclick', this, 'clicked');
    this.field.appendChild(background.Models.multipleTumblelogs.reduce(function (df, model) {
      df.appendChild(self.createElement(model));
      return df;
    }, $DF()));
  }

  TumbleList.prototype = {
    clicked: function () {
      var self = this;
      $D(this.field);
      background.Models.getMultiTumblelogs(false).then(function (models) {
        self.field.appendChild(models.reduce(function (df, model) {
          df.appendChild(self.createElement(model));
          return df;
        }, $DF()));
      });
    },
    createElement: function (model) {
      var img = $N('img', {
        src: model.ICON,
        class: 'list_icon'
      });
      var label = $N('p', {
        class: 'list_text'
      }, model.name);
      return $N('div', {
        'class': 'list'
      }, [img, label]);
    },
    remove: function () {
      background.Models.removeMultiTumblelogs();
    }
  };

  // HatenaBlog
  function HatenaBlogList() {
    var self = this;
    this.field = $('list_HatenaBlog');
    this.button = $('getHatenaBlog_button');
    connect(this.button, 'onclick', this, 'clicked');
    this.field.appendChild(background.Models.hatenaBlogs.reduce(function (df, model) {
      df.appendChild(self.createElement(model));
      return df;
    }, $DF()));
  }
  HatenaBlogList.prototype = {
    clicked : function () {
      var self = this;
      $D(this.field);
      background.Models.getHatenaBlogs().then(function (models) {
        self.field.appendChild(models.reduce(function (df, model) {
          df.appendChild(self.createElement(model));
          return df;
        }, $DF()));
      });
    },
    createElement : function (model) {
      var img = $N('img', {
        src   : model.ICON,
        class : 'list_icon'
      });
      var label = $N('p', {
        class : 'list_text'
      }, model.name);
      return $N('div', {
        'class' : 'list'
      }, [img, label]);
    },
    remove: function () {
      background.Models.removeHatenaBlogs();
    }
  };

  // Patches
  function initPatches() {
    $('label_patch_name').appendChild($T(chrome.i18n.getMessage('label_patch')));
    $('label_patch_enabled').appendChild($T(chrome.i18n.getMessage('label_enable')));
    $('label_patch_file').appendChild($T(chrome.i18n.getMessage('label_patch') + ' (*.tbrl.js) : '));
    var button_install = $('button_patch_install');
    button_install.appendChild($T(chrome.i18n.getMessage('label_install')));
    connect(button_install, 'onclick', button_install, function () {
      var patch_file = $('patch_file');
      if (patch_file.files.length && /\.tbrl\.js$/.test(patch_file.files[0].name)) {
        background.Patches.install(patch_file.files[0]).then(function (res) {
          if (res) {
            refreshTable();
            background.window.location.reload();
          }
        });
      }
    });

    var button_check_updates = $('button_check_updates');
    button_check_updates.appendChild($T(chrome.i18n.getMessage('label_check_updates')));
    connect(button_check_updates, 'onclick', button_check_updates, function () {
      background.Patches.checkUpdates();
    });

    function refreshTable() {
      var tbody = $('patch_body');
      for (var i = 0, len = tbody.childNodes.length ; i < len ; i++) {
        tbody.removeChild(tbody.childNodes[0]);
      }
      createTable();
    }

    function createTable() {
      var tbody = $('patch_body');
      var df = $DF();

      background.Patches.values.forEach(function (patch) {
        var preference = background.Patches.getPreferences(patch.name) || {};
        var tds = [];

        var name = patch.name.replace(/\./g, '_');
        var td_children = [];
        if (patch.metadata.name) {
          td_children.push($N('span', null, patch.metadata.name));
          td_children.push($N('br'));
        }
        td_children.push($N('a', {
          class  : 'patch_name',
          href   : patch.fileEntry.toURL(),
          target : '_blank'
        }, patch.name));
        tds.push($N('td', null, td_children));

        tds.push($N('td', {
          class : 'patch_version'
        }, patch.metadata.version || ''));

        var checkbox_enabled = $N('input', {
          type  : 'checkbox',
          id    : name + '_enabled',
          name  : name + '_enabled'
        });
        checkbox_enabled.checked = !preference.disabled;
        connect(checkbox_enabled, 'onclick', checkbox_enabled, function () {
          if (this.checked) {
            background.Patches.setPreferences(patch.name, update(preference, {
              disabled : false
            }));
          } else {
            background.Patches.setPreferences(patch.name, update(preference, {
              disabled : true
            }));
          }
          background.window.location.reload();
        });
        tds.push($N('td', {
          class : 'patch_enabled'
        }, checkbox_enabled));

        var button_uninstall = $N('button', {
          id    : name + '_uninstall',
          name  : name + '_uninstall'
        }, chrome.i18n.getMessage('label_uninstall'));
        connect(button_uninstall, 'onclick', button_uninstall, function () {
          if (confirm(chrome.i18n.getMessage('confirm_delete'))) {
            background.Patches.uninstall(patch).then(function () {
              tr.parentNode.removeChild(tr);
              background.window.location.reload();
            });
          }
        });
        tds.push($N('td', {
          class : 'patch_uninstall'
        }, button_uninstall));

        var tr = $N('tr', {
          class: 'patch',
          id: name
        }, tds);
        df.appendChild(tr);
      });
      tbody.appendChild(df);
    }
    createTable();
  }

  function initBackup() {
    zip.workerScriptsPath = '/third_party/zipjs/';

    var label_backup_button = $('label_backup_button');
    label_backup_button.appendChild($T(chrome.i18n.getMessage('label_backup_button')));
    var label_backup_file = $('label_backup_file');
    label_backup_file.appendChild($T(chrome.i18n.getMessage('label_backup_file')));
    var label_reset_button = $('label_reset_button');
    label_reset_button.appendChild($T(chrome.i18n.getMessage('label_reset_button')));

    connect(window, 'onload', window, function () {
      var backup_file = $('backup_file');
      var pos = label_backup_file.offsetWidth + backup_file.offsetWidth +
        parseInt(getComputedStyle(backup_file).marginLeft, 10) +
        parseInt(getComputedStyle(backup_file).marginRight, 10);

      label_backup_button.style.width = pos + 'px';
      label_reset_button.style.width = pos + 'px';
    });

    var backup_download = $('backup_download');
    var button_backup = $('button_backup');
    button_backup.appendChild($T(chrome.i18n.getMessage('label_backup')));
    connect(button_backup, 'onclick', button_backup, function () {
      var writer = new zip.BlobWriter();
      zip.createWriter(writer, function (zipWriter) {
        var configurations = {};
        for (var key in background.localStorage) {
          var value = background.localStorage.getItem(key);
          try {
            configurations[key] = JSON.parse(value);
          }
          catch (e) {
            configurations[key] = value;
          }
        }
        var data = JSON.stringify(configurations, undefined, 2);

        var patches = background.Patches.values;
        var index   = 0;
        function addFileToZip() {
          var patch = patches[index];
          patch.fileEntry.file(function (file) {
            zipWriter.add(patch.fileEntry.name, new zip.BlobReader(file), function () {
              index++;
              if (index < patches.length) {
                addFileToZip();
              } else {
                downloadZip();
              }
            });
          });
        }

        zipWriter.add('taberareloo-settings.json', new zip.TextReader(data), function () {
          if (patches.length) {
            addFileToZip();
          } else {
            downloadZip();
          }
        });

        function downloadZip() {
          zipWriter.close(function (blob) {
            backup_download.href = (window.webkitURL || window.URL).createObjectURL(blob);
            backup_download.download = 'taberareloo-settings.zip';
            backup_download.dispatchEvent(new MouseEvent('click'));
          });
        }
      }, function (message) {
        console.log(message);
      });
    });

    function restore() {
      var backup_file = $('backup_file');
      if (backup_file.files.length) {
        var files = {};
        zip.createReader(new zip.BlobReader(backup_file.files[0]), function (zipReader) {
          zipReader.getEntries(function (entries) {
            entries.forEach(function (entry) {
              files[entry.filename] = new Promise(function (resolve) {
                if (entry.filename === 'taberareloo-settings.json') {
                  entry.getData(new zip.TextWriter(), function (data) {
                    var json = JSON.parse(data);
                    for (var key in json) {
                      var value = json[key];
                      if (typeof value !== 'string') {
                        value = JSON.stringify(value);
                      }
                      background.localStorage.setItem(key, value);
                    }
                    resolve();
                  });
                } else {
                  entry.getData(new zip.BlobWriter('application/javascript'), function (blob) {
                    blob.name = entry.filename;
                    background.Patches.install(blob, true).then(function () {
                      resolve();
                    });
                  });
                }
              });
            });

            promiseAllHash(files).then(function () {
              alert(chrome.i18n.getMessage('message_restored'));
              chrome.runtime.reload();
            });
          });
        }, function (message) {
          console.log(message);
        });
      }
    }

    var button_restore = $('button_restore');
    button_restore.appendChild($T(chrome.i18n.getMessage('label_restore')));
    connect(button_restore, 'onclick', button_restore, function () {
      reset().then(function () {
        restore();
      });
    });

    function reset() {
      for (var key in background.localStorage) {
        background.localStorage.removeItem(key);
      }

      var patches = {};
      background.Patches.values.forEach(function (patch) {
        patches[patch.fileEntry.name] = background.Patches.uninstall(patch, true);
      });
      return promiseAllHash(patches);
    }

    var button_reset = $('button_reset');
    button_reset.appendChild($T(chrome.i18n.getMessage('label_reset')));
    connect(button_reset, 'onclick', button_reset, function () {
      if (confirm(chrome.i18n.getMessage('confirm_reset'))) {
        reset().then(function () {
          alert(chrome.i18n.getMessage('message_reset'));
          chrome.runtime.reload();
        });
      }
    });
  }

  exports.Options = Options;
  exports.Services = Services;
  exports.Provider = Provider;
  exports.Check = Check;
  exports.Input = Input;
  exports.Dragger = Dragger;
  exports.TemplateInput = TemplateInput;
  exports.Shortcutkey = Shortcutkey;
  exports.TumbleList = TumbleList;
  exports.initPatches = initPatches;
  exports.initBackup = initBackup;
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
