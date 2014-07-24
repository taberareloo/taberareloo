// -*- coding: utf-8 -*-
/*jshint evil:true*/
/*global Repository:true, TBRL:true, chrome:true*/
/*global Keybind:true, get_active_feed:true, get_active_item:true*/
/*global $X:true, createFlavoredString:true, update:true, Extractors:true*/
/*global $N:true, keyString:true, stop:true, Tumblr:true*/
/*global MouseEvent:true*/
(function (exports) {
  'use strict';

  var isDashboard = /^https?:\/\/www\.tumblr\.com\/(?:(?:dashboard|likes)|(?:liked\/by|show|tagged|blog)\/)/.test(location.href);

  function isImageFeed(feed) {
    var sites = [
      'flickr.com/',
      'http://ffffound.com',
      'http://www.bighappyfunhouse.com',
      'http://f.hatena.ne.jp',
      'http://lpcoverlover.com',
      'http://www.chicksnbreasts.com',
      '1eb46a2f1f83c340eee10cd49c144625'
    ];
    return sites.some(function (pattern) { return ~feed.indexOf(pattern); });
  }

  var UserScripts = exports.UserScripts = new Repository();

  UserScripts.register([
    {
      name  : 'LDR + Taberareloo',
      check : function () {
        var key = TBRL.config.post.shortcutkey_ldr_plus_taberareloo;
        var host = location.host;
        if ((host === 'reader.livedoor.com' || host === 'fastladder.com') && TBRL.config.post.ldr_plus_taberareloo) {
          this.key = key;
          return true;
        } else {
          return false;
        }
      },
      exec  : function () {
        var style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = chrome.runtime.getURL('styles/reader.css');
        document.head.appendChild(style);
        this.key = this.keyString2LDR(this.key);
        var self = this;
        setTimeout(function () {
          TBRL.eval(self.script, self.key);
        }, 1000);
        window.addEventListener('Taberareloo.LDR', this.wrap, false);
      },
      unload: function () {
        window.removeEventListener('Taberareloo.LDR', this.wrap, false);
      },
      specials: {
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
      },
      defs: {
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
      },
      keyString2LDR: function (key) {
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
      },
      script: function (key) {
        var id = setTimeout(function callee() {
          if (id) {
            clearTimeout(id);
          }
          if (typeof Keybind !== 'undefined') {
            Keybind.add(key, function () {
              try {
                var feed = get_active_feed();
                var item = get_active_item(true);
                var target = item.element;
                var text = Object.toJSON({
                  feed: feed.channel.link
                });
                var ev = document.createEvent('MessageEvent');
                ev.initMessageEvent('Taberareloo.LDR', true, false, text, location.protocol + '//' + location.host, '', window);
                target.dispatchEvent(ev);
              } catch (e) {}
            });
          } else {
            id = setTimeout(callee, 100);
          }
        }, 0);
      },
      fire  : function (ev) {
        var target = ev.target;
        $X('ancestor::div[starts-with(@id, "item_count")]/parent::div', target)[0].classList.add('TBRL_posted');
        var data = JSON.parse(ev.data);
        var body = $X('ancestor::div[starts-with(@id, "item_count")]/parent::div//div[@class="item_body"]', target)[0];
        var sel = createFlavoredString(window.getSelection());
        var ctx = update({
          document  : document,
          window    : window,
          selection : (sel.raw) ? sel : null,
          target    : target,
          event     : {},
          title     : null,
          mouse     : null,
          menu      : null
        }, window.location);

        if (isImageFeed(data.feed)) {
          ctx.onImage = true;
          ctx.target = $X('.//img[1]', body)[0];
        }
        var ext = Extractors.check(ctx)[0];
        return TBRL.share(ctx, ext, ext.name.match(/^Link /));
      },
      wrap  : function (ev) {
        UserScripts['LDR + Taberareloo'].fire(ev);
      }
    },

    {
      name  : 'Dashboard + Taberareloo',
      count : 0,
      keys  : {},
      check : function () {
        var r_key  = TBRL.config.post.shortcutkey_dashboard_plus_taberareloo;
        var r_flag = TBRL.config.post.dashboard_plus_taberareloo;
        var m_key  = TBRL.config.post.shortcutkey_dashboard_plus_taberareloo_manually;
        var m_flag = TBRL.config.post.dashboard_plus_taberareloo_manually;
        if (isDashboard && ((r_flag && r_key) || (m_flag && m_key))) {
          if (r_flag) {
            this.keys[r_key] = false;
          }
          if (m_flag) {
            this.keys[m_key] = true;
          }
          return true;
        } else {
          return false;
        }
      },
      exec  : function () {
        var style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = chrome.runtime.getURL('styles/dashboard.css');
        document.head.appendChild(style);

        // copied from FLASH KEY (c) id:brazil
        // http://userscripts.org/scripts/show/11996
        // slightly modified.
        function FlashMessage() {
          var opacity = 0.9;
          var flash = $N('div', { class: 'FLASH_MESSAGE' });

          function hide(target) {
            target.style.display = 'none';
            target.style.transition = '';
          }
          function show(target, style) {
            target.style.display = (style || '');
          }

          hide(flash);
          document.body.appendChild(flash);
          this.showFlashMessageWindow = function (string, duration) {
            if (duration == null) {
              duration = 400;
            }
            hide(flash);
            flash.textContent = string;
            flash.style.opacity = opacity;
            show(flash);
            flash.style.marginLeft = (-(flash.offsetWidth / 2)) + 'px';
            setTimeout(function () {
              flash.style.transition = 'opacity ' + (Math.floor(duration / 100) / 10) + 's ease-out';
              flash.style.opacity = '0';
            }, 0);
          };
        }

        this.FlashMessage = new FlashMessage();
        document.addEventListener('keydown', this.wrap, false);
      },
      getCurrentItem: function () {
        var paragraphs = $X('id("posts")/li[div[starts-with(@id, "post_")]]'), toplist = new Array(paragraphs.length);
        var get_top = function (index) {
          return toplist[index] || (toplist[index] = paragraphs[index].getBoundingClientRect().top);
        };
        function bsearch(list, compare) {
          var lower = -1, upper = list.length, mid = null;
          while (lower + 1 !== upper) {
            mid = Math.floor((lower + upper) / 2);
            if (compare(mid) <= 0) {
              lower = mid;
            } else {
              upper = mid;
            }
          }
          return list[lower + 1];
        }
        return bsearch(paragraphs, function (index) {
          return (get_top(index) < 0) ? -1 : 1;
        });
      },
      unload: function () {
        document.removeEventListener('keydown', this.wrap, false);
      },
      getStatus: function () {
        var that = this;
        return new Promise(function (resolve) {
          var ev_name = 'LDRize.status.Taberareloo' + (++that.count);
          document.addEventListener(ev_name, function callee(e) {
            document.removeEventListener(ev_name, callee, false);
            var data = JSON.parse(e.data);
            resolve(data);
          }, false);
          var message = JSON.stringify({ type: ev_name });
          var ev = document.createEvent('MessageEvent');
          ev.initMessageEvent('LDRize.getStatus', true, false, message, location.protocol + '//' + location.host, '', window);
          document.dispatchEvent(ev);
        });
      },
      reblogPins : function (len, manually) {
        var self = this;
        return new Promise(function (resolve) {
          var ev_name = 'LDRize.strokePins.Taberareloo' + (++self.count);
          var returned = 0;
          document.addEventListener(ev_name, function callee(e) {
            var target = e.target;

            setTimeout(function () {
              self.notify(target, true);
              self.reblog(target, manually);
            }, returned * 1000);

            if (++returned === len) {
              document.removeEventListener(ev_name, callee, false);
              setTimeout(function () {
                self.FlashMessage.showFlashMessageWindow('ReBlog ' + len + ' items', 600);
                resolve();
              }, 0);
            }
          }, false);
          var message = JSON.stringify({type: ev_name });
          var ev = document.createEvent('MessageEvent');
          ev.initMessageEvent('LDRize.strokePins', true, false, message, location.protocol + '//' + location.host, '', window);
          document.dispatchEvent(ev);
        });
      },
      clearPins: function () {
        var that = this;
        return new Promise(function (resolve) {
          var ev_name = 'LDRize.clearPins.Taberareloo' + (++that.count);
          document.addEventListener(ev_name, function callee() {
            document.removeEventListener(ev_name, callee, false);
            resolve();
          }, false);
          var message = JSON.stringify({ type: ev_name });
          var ev = document.createEvent('MessageEvent');
          ev.initMessageEvent('LDRize.clearPins', true, false, message, location.protocol + '//' + location.host, '', window);
          document.dispatchEvent(ev);
        });
      },
      fire  : function (ev) {
        var self = this;
        var key  = keyString(ev);
        if (key in this.keys) {
          if (!('selectionStart' in ev.target && ev.target.disabled !== true)) {
            stop(ev);
            var manually = this.keys[key];
            this.getStatus().then(function (data) {
              var pins_count = data.pins_count;
              if (pins_count > 0) {
                return self.reblogPins(pins_count, manually).then(function () {
                  return self.clearPins();
                });
              } else {
                var current = self.getCurrentItem();
                if (current) {
                  self.notify(current);
                  return self.reblog(current, manually);
                }
              }
              return null;
            });
          }
        }
      },
      reblog: function (node, manually) {
        var post = node.classList.contains('post') ? node : node.querySelector('.post');
        var sel = createFlavoredString(window.getSelection());
        var ctx = update({
          document  : document,
          window    : window,
          selection : (sel.raw) ? sel : null,
          target    : post,
          event     : {},
          title     : null,
          mouse     : null,
          menu      : null
        }, window.location);
        var ext = Extractors['ReBlog - Dashboard'];
        return (ext.check(ctx)) ? TBRL.share(ctx, ext, !!manually) : null;
      },
      notify: function (elm, hide) {
        var post = elm.classList.contains('post') ? elm : elm.querySelector('.post');
        var duration = 600;
        if (!hide) {
          this.FlashMessage.showFlashMessageWindow('ReBlog', duration);
        }
        post.style.transition = '';
        post.style.backgroundColor = 'salmon';
        setTimeout(function () {
          post.style.transition = 'background-color ' + (Math.floor(duration / 100) / 10) + 's ease-out';
          post.style.backgroundColor = '';
        }, 0);
      },
      wrap  : function (ev) {
        return UserScripts['Dashboard + Taberareloo'].fire(ev);
      }
    },
  ]);

  UserScripts.register({
    name : 'Play on Tumblr',
    dash : UserScripts['Dashboard + Taberareloo'],
    keys : {},
    check: function () {
      var play_s = TBRL.config.post.shortcutkey_play_on_tumblr_play;
      var like_s = TBRL.config.post.shortcutkey_play_on_tumblr_like;
      var count_s = TBRL.config.post.shortcutkey_play_on_tumblr_count;
      if (isDashboard &&
         ((TBRL.config.post.play_on_tumblr_play && play_s) ||
          (TBRL.config.post.play_on_tumblr_like && like_s) ||
          (TBRL.config.post.play_on_tumblr_count && count_s))) {
        if (TBRL.config.post.play_on_tumblr_play && play_s) {
          this.keys[play_s] = this.play;
        }
        if (TBRL.config.post.play_on_tumblr_like && like_s) {
          this.keys[like_s] = this.like;
        }
        if (TBRL.config.post.play_on_tumblr_count && count_s) {
          this.keys[count_s] = this.reblogCount;
        }
        return true;
      } else {
        return false;
      }
    },
    exec : function () {
      window.addEventListener('keydown', this.wrap, true);
    },
    fire : function (ev) {
      if (!('selectionStart' in ev.target && ev.target.disabled !== true)) {
        var key = keyString(ev);
        if (key in this.keys) {
          var current = this.dash.getCurrentItem();
          if (!current) {
            return;
          }
          stop(ev);
          this.keys[key].call(this, current);
        }
      }
    },
    play : function (current) {
      var post = current.querySelector('.post');

      // quit photoset lightbox or panorama lightbox
      var lightbox = document.body.querySelector('#tumblr_lightbox, .pano_lightbox');
      if (lightbox) {
        lightbox.click();
        return;
      }

      // for photo(not full size) post, inline image
      var small_image = current.querySelector(
        '.image_thumbnail, .constrained_image'
      );
      if (small_image) {
        small_image.click();
      }

      var data = post.dataset;

      // for Tumblr uploaded audio post
      if (data.type === 'audio') {
        var audio_player_overlay = current.querySelector('.audio_player_overlay');
        if (audio_player_overlay) {
          audio_player_overlay.dispatchEvent(new MouseEvent('mousedown'));
        }
        return;
      }

      // for Tumblr uploaded video post
      if (data.type === 'video' && data.directVideo === '1') {
        var tumblr_video_iframe = current.querySelector('.tumblr_video_iframe');

        if (tumblr_video_iframe) {
          var contentDocument = tumblr_video_iframe.contentDocument;
          if (contentDocument) {
            var tumblr_video_player = contentDocument.querySelector('.tumblr_video_player');
            if (!tumblr_video_player) {
              return;
            }

            // toggle video playing and video lightbox launching
            if (post.classList.contains('is_lightbox')) {
              var tvp_pause_button = tumblr_video_player.querySelector('.tvp_pause_button');
              if (tvp_pause_button) {
                tvp_pause_button.click();
              }
              var close_button = current.querySelector('.close_button');
              if (close_button) {
                close_button.click();
              }
            } else {
              var tvp_play_button = tumblr_video_player.querySelector('.tvp_play_button');
              var init = tumblr_video_player.classList.contains('init');
              if (tvp_play_button) {
                tvp_play_button.click();
              }
              if (init) {
                var tvp_fullscreen_button = tumblr_video_player.querySelector('.tvp_fullscreen_button');
                if (tvp_fullscreen_button) {
                  tvp_fullscreen_button.click();
                }
              }
            }
          }
        }

        return;
      }

      // for photoset, panorama, link, video post.
      var target = current.querySelector(
        '.photoset_photo, .panorama, .link_title, .big_play_button'
      );
      if (target) {
        target.click();
      }
    },
    like : function (current) {
      var like = current.querySelector('.like');
      if (like) {
        like.click();
      }
    },
    reblogCount: function (current) {
      var count = current.querySelector('.post_notes_label');
      if (count) {
        count.click();
      }
    },
    unload: function () {
      window.removeEventListener('keydown', this.wrap, true);
    },
    wrap  : function (ev) {
      return UserScripts['Play on Tumblr'].fire(ev);
    }
  });

  UserScripts.register({
    name : 'Disable Tumblr default Keybind',
    check : function () {
      if (TBRL.config.post.disable_tumblr_default_keybind) {
        return isDashboard;
      }
      return false;
    },
    exec  : function () {
      // thx id:os0x, id:bardiche, id:syoichi
      var script = $N('script', { type: 'text/javascript' });
      script.textContent = '(' + function () {
        if (window.Tumblr && Tumblr.enable_dashboard_key_commands && !Tumblr.KeyCommands.suspended) {
          Tumblr.KeyCommands.suspend();
        }
      } + '());';
      document.head.appendChild(script);
    }
  });
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
