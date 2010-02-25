// vim: fileencoding=utf-8

var UserScripts = new Repository();

UserScripts.register([
  {
    name  : 'LDR + Taberareloo',
    check : function(){
      var key = TBRL.config['post']['shortcutkey_ldr_plus_taberareloo'];
      var host = location.host;
      if((host === 'reader.livedoor.com' || host === 'fastladder.com') && TBRL.config['post']['ldr_plus_taberareloo']){
        this.key = key;
        return true;
      } else {
        return false;
      }
    },
    exec  : function(){
      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/reader.css');
      document.head.appendChild(style);
      this.key = this.keyString2LDR(this.key);
      TBRL.eval(this.script, this.key);
      window.addEventListener('Taberareloo.LDR', this.wrap, false);
    },
    unload: function(){
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
    keyString2LDR: function(key){
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
    },
    script: function(key){
      var id = setTimeout(function(){
        if(id) clearTimeout(id);
        if(typeof Keybind !== 'undefined'){
          Keybind.add(key, function(){
            try{
              var feed = get_active_feed();
              var item = get_active_item(true);
              var target = item.element;
              var text = Object.toJSON({
                feed: feed.channel.link
              });
              var ev = document.createEvent('MessageEvent');
              ev.initMessageEvent('Taberareloo.LDR', true, false, text, location.protocol+"//"+location.host, "", window);
              target.dispatchEvent(ev);
            }catch(e){}
          });
        } else {
          id = setTimeout(arguments.callee, 100);
        }
      }, 0);
    },
    fire  : function(ev){
      var target = ev.target;
      addElementClass($X('ancestor::div[starts-with(@id, "item_count")]/parent::div', target)[0], 'TBRL_posted');
      var data = JSON.parse(ev.data);
      var body = $X('ancestor::div[starts-with(@id, "item_count")]/parent::div//div[@class="item_body"]', target)[0];
      var sel = createFlavoredString(window.getSelection());
      var ctx = update({
          document  : document,
          window    : window,
          selection : (!!sel.raw)? sel : null,
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
    wrap  : function(ev){
      UserScripts['LDR + Taberareloo'].fire(ev);
    }
  },

  {
    name  : 'Dashboard + Taberareloo',
    count : 0,
    keys  : {},
    check : function(){
      var r_key = TBRL.config['post']['shortcutkey_dashboard_plus_taberareloo'];
      var r_flag= TBRL.config['post']['dashboard_plus_taberareloo'];
      var m_key = TBRL.config['post']['shortcutkey_dashboard_plus_taberareloo_manually'];
      var m_flag= TBRL.config['post']['dashboard_plus_taberareloo_manually'];
      if((/^http:\/\/www\.tumblr\.com\/dashboard/.test(location.href)    ||
          /^http:\/\/www\.tumblr\.com\/popular\/top/.test(location.href) ||
          /^http:\/\/www\.tumblr\.com\/show\//.test(location.href) ||
          /^http:\/\/www\.tumblr\.com\/tagged\//.test(location.href)     ||
          /^http:\/\/www\.tumblr\.com\/tumblelog\//.test(location.href)
         ) && ((r_flag && r_key) ||
               (m_flag && m_key))){
        if(r_flag)
          this.keys[r_key] = false;
        if(m_flag)
          this.keys[m_key] = true;
        return true;
      } else {
        return false;
      }
    },
    exec  : function(){
      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/dashboard.css');
      document.head.appendChild(style);

      // id:os0x
      location.href="javascript:window.key_commands_are_suspended = true;void 0;";

      // copied from FLASH KEY (c) id:brazil
      // http://userscripts.org/scripts/show/11996
      // slightly modified.
      this.FlashMessage = new function(){
        var opacity = 0.9;
        var flash = document.createElement('div');
        flash.setAttribute('id', 'FLASH_MESSAGE');
        hide(flash);
        document.body.appendChild(flash);
        this.showFlashMessageWindow = function (string, duration) {
          duration || (duration = 400);
          hide(flash);
          flash.textContent = string;
          flash.style.opacity = opacity;
          show(flash);
          flash.style.marginLeft = (-(flash.offsetWidth/2))+'px';
          setTimeout(function(){
            flash.style.webkitTransition = 'opacity '+(Math.floor(duration / 100)/10)+'s ease-out';
            flash.style.opacity = '0';
          }, 0);
        };
        function hide(target){
          target.style.display='none';
          target.style.webkitTransition = '';
        }
        function show(target, style){
          target.style.display=(style || '');
        }
      };

      document.addEventListener('keydown', this.wrap, false);
    },
    getCurrentItem: function(){
      var paragraphs = $X('id("posts")/li[starts-with(@id, "post") or starts-with(@id, "tweet")]'), toplist = new Array(paragraphs.length), current = null;
      var get_top = function(index){
        return toplist[index] || (toplist[index] = paragraphs[index].getBoundingClientRect().top);
      }
      function bsearch(list, compare){
        var lower = -1, upper = list.length, mid = null;
        while(lower + 1 !== upper){
          mid = Math.floor((lower + upper) / 2);
          if(compare(mid) <= 0)
            lower = mid;
          else
            upper = mid;
        }
        return list[lower+1];
      }
      return bsearch(paragraphs, function(index){
        return (get_top(index) < 0)? -1 : 1;
      });
    },
    unload: function(){
      document.removeEventListener('keydown', this.wrap, false);
    },
    getStatus: function(){
      var ret = new Deferred();
      var ev_name = 'LDRize.status.Taberareloo'+(++this.count);
      document.addEventListener(ev_name, function(e){
        document.removeEventListener(ev_name, arguments.callee, false);
        var data = JSON.parse(e.data);
        ret.callback(data);
      }, false);
      var message = JSON.stringify({type: ev_name });
      var ev = document.createEvent('MessageEvent');
      ev.initMessageEvent('LDRize.getStatus', true, false, message, location.protocol + '//' + location.host, '', window);
      document.dispatchEvent(ev);
      return ret;
    },
    reblogPins : function(len, manually){
      var ret = new Deferred();
      var self = this;
      var ev_name = 'LDRize.strokePins.Taberareloo'+(++this.count);
      var results = [];
      var returned = 0;
      document.addEventListener(ev_name, function(e){
        var target = e.target;
        setTimeout(function(){
          self.notify(target, true);
          self.reblog(target, manually);
        }, 0);
        if(++returned === len){
          document.removeEventListener(ev_name, arguments.callee, false);
          setTimeout(function(){
            self.FlashMessage.showFlashMessageWindow('ReBlog '+len+' items', 600);
            ret.callback();
          }, 0);
        }
      }, false);
      var message = JSON.stringify({type: ev_name });
      var ev = document.createEvent('MessageEvent');
      ev.initMessageEvent('LDRize.strokePins', true, false, message, location.protocol + '//' + location.host, '', window);
      document.dispatchEvent(ev);
      return ret;
    },
    clearPins: function(){
      var ret = new Deferred();
      var self = this;
      var ev_name = 'LDRize.clearPins.Taberareloo'+(++this.count);
      document.addEventListener(ev_name, function(e){
        document.removeEventListener(ev_name, arguments.callee, false);
        ret.callback();
      }, false);
      var message = JSON.stringify({type: ev_name });
      var ev = document.createEvent('MessageEvent');
      ev.initMessageEvent('LDRize.clearPins', true, false, message, location.protocol + '//' + location.host, '', window);
      document.dispatchEvent(ev);
      return ret;
    },
    fire  : function(ev){
      var self = this;
      var key  = keyString(ev);
      if(key in this.keys){
        if(!('selectionStart' in ev.target && ev.target.disabled !== true)){
          stop(ev);
          var manually = this.keys[key];
          this.getStatus().addCallback(function(data){
            var pins_count = data.pins_count;
            if(pins_count > 0){
              return self.reblogPins(pins_count, manually).addCallback(function(){
                return self.clearPins();
              });
            } else {
              var current = self.getCurrentItem();
              if(current){
                self.notify(current);
                return self.reblog(current, manually);
              }
            }
          });
        }
      }
    },
    reblog: function(node, manually){
      var sel = createFlavoredString(window.getSelection());
      var ctx = update({
          document  : document,
          window    : window,
          selection : (!!sel.raw)? sel : null,
          target    : node,
          event     : {},
          title     : null,
          mouse     : null,
          menu      : null
      }, window.location);
      var ext = Extractors['ReBlog - Dashboard'];
      if(ext.check(ctx)){
        return TBRL.share(ctx, ext, !!manually);
      }
    },
    notify: function(elm, hide){
      var duration = 600;
      if(!hide) this.FlashMessage.showFlashMessageWindow('ReBlog', duration);
      elm.style.webkitTransition = '';
      elm.style.backgroundColor = 'salmon';
      setTimeout(function(){
        elm.style.webkitTransition = 'background-color '+(Math.floor(duration / 100)/10)+'s ease-out';
        elm.style.backgroundColor = '';
      }, 0);
    },
    wrap  : function(ev){
      return UserScripts['Dashboard + Taberareloo'].fire(ev);
    }
  },

  {
    name  : 'GoogleReader + Taberareloo',
    check : function(){
      var key = TBRL.config['post']['shortcutkey_googlereader_plus_taberareloo'];
      if(/^https?:\/\/www\.google\.[^/\.]+\/reader\//.test(location.href) && TBRL.config['post']['googlereader_plus_taberareloo'] && key){
        this.key = key;
        return true;
      } else {
        return false;
      }
    },
    exec  : function(){
      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = chrome.extension.getURL('styles/reader.css');
      document.head.appendChild(style);
      document.addEventListener('keydown', this.wrap, false);
    },
    unload: function(){
      document.removeEventListener('keydown', this.wrap, false);
    },
    fire  : function(ev){
      var key = keyString(ev);
      if(key !== this.key) return null;
      if(!('selectionStart' in ev.target && ev.target.disabled !== true)){
        var item = this.getCurrentItem();
        if(!item) return null;
        stop(ev);
        var sel = createFlavoredString(window.getSelection());
        var ctx = update({
          document  : document,
          window    : window,
          selection : (!!sel.raw)? sel : null,
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
      }
    },
    getCurrentItem: function(){
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
    },
    wrap  : function(ev){
      return UserScripts['GoogleReader + Taberareloo'].fire(ev);
    }
  },

]);

UserScripts.register({
  name : 'Play on Tumblr',
  dash : UserScripts['Dashboard + Taberareloo'],
  keys : {},
  check: function(ctx){
    var play_s = TBRL.config['post']['shortcutkey_play_on_tumblr_play'];
    var like_s = TBRL.config['post']['shortcutkey_play_on_tumblr_like'];
    var count_s = TBRL.config['post']['shortcutkey_play_on_tumblr_count'];
    if((/^http:\/\/www\.tumblr\.com\/dashboard/.test(location.href)    ||
        /^http:\/\/www\.tumblr\.com\/popular\/top/.test(location.href) ||
        /^http:\/\/www\.tumblr\.com\/show\//.test(location.href) ||
        /^http:\/\/www\.tumblr\.com\/tagged\//.test(location.href)     ||
        /^http:\/\/www\.tumblr\.com\/tumblelog\//.test(location.href)
       ) && ((TBRL.config['post']['play_on_tumblr_play']  && play_s )||
             (TBRL.config['post']['play_on_tumblr_like']  && like_s )||
             (TBRL.config['post']['play_on_tumblr_count'] && count_s))){
      if(TBRL.config.post['play_on_tumblr_play'] && play_s){
        this.keys[play_s] = this.play;
      }
      if(TBRL.config.post['play_on_tumblr_like'] && like_s){
        this.keys[like_s] = this.like;
      }
      if(TBRL.config.post['play_on_tumblr_count'] && count_s){
        this.keys[count_s] = this.reblogCount;
      }
      return true;
    } else {
      return false;
    }
  },
  exec : function(){
    // id:os0x
    // TODO: タイミングの点. 及び複数回実行の点
    //       次で, 単体UserScript(optionなし)に分離します.
    location.href="javascript:window.key_commands_are_suspended = true;void 0;";
    document.addEventListener('keydown', this.wrap, false);
  },
  fire : function(ev){
    if(!('selectionStart' in ev.target && ev.target.disabled !== true)){
      var key = keyString(ev);
      if(key in this.keys){
        var current = this.dash.getCurrentItem();
        if(!current) return;
        stop(ev);
        this.keys[key].call(this, current);
      }
    }
  },
  play : function(current){
    var self = this;
    var small = !!$X('.//img[contains(@class, "image_thumbnail")]', current)[0];
    if(small){
      var img = $X('.//div[starts-with(@id, "highres_photo")]', current)[0];
      if(img){
        if(img.style.display !== 'none'){
          this.click($X('./a', img)[0]);
        } else {
          this.click($X('./preceding-sibling::a[1]', img)[0]);
        }
        return;
      }
    }
    if($X('.//div[contains(@id, "watch_") and .//a]', current).some(function(mov){
      if(mov.style.display !== 'none'){
        self.click($X('.//a', mov)[0]);
        return true;
      }
      return false;
    })){
      return;
    }
    if(small){
      $X('.//img[contains(@src, "media.tumblr.com/tumblr_")]', current).forEach(function(timg, index){
        self.click(timg);
      });
    }
  },
  like : function(current){
    var self = this;
    var like = $X('./descendant-or-self::form[not(contains(@style, "none"))]/input[contains(concat(" ", @class, " "), " like_button ")]', current)[0];
    if(like) self.click(like);
  },
  reblogCount: function(current){
    var count = $X('.//a[contains(concat(" ",@class," "), " reblog_count ")]', current)[0];
    if(count)
      this.click(count);
  },
  click : function(elm){
    var ev = document.createEvent('MouseEvents');
    ev.initMouseEvent('click', true, true, window, 1, 10, 50, 10, 50, 0, 0, 0, 0, 1, elm);
    elm.dispatchEvent(ev);
  },
  unload: function(){
    document.removeEventListener('keydown', this.wrap, false);
  },
  wrap  : function(ev){
    return UserScripts['Play on Tumblr'].fire(ev);
  }
});
