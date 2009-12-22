// vim: fileencoding=utf-8
// content script space

(function(){
  var connection = chrome.extension.connect({name : 'TBRL'});
  var lid = 0;
  var id = chrome.extension.getURL('').match(/chrome-extension:\/\/([^\/]+)\//)[1];

  var log = function(){
    var d = new Deferred();
    chrome.extension.sendRequest(id, {
      request: "log",
      content: $A(arguments)
    }, function(res){
      d.callback(res);
    });
    return d;
  }

  var TBRL = {
    target : null,
    config : null,
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

      var host = location.host;
      if((host === 'reader.livedoor.com' || host === 'fastladder.com') &&
        TBRL.config['post']['ldr_plus_taberareloo']){

        var style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = chrome.extension.getURL('styles/ldr.css');
        document.head.appendChild(style);

        var script = document.createElement('script');
        script.type = "text/javascript";
        script.charset = "utf-8";
        script.src = chrome.extension.getURL('lib/ldr_plus_taberareloo.js');
        document.head.appendChild(script);
        window.addEventListener('Taberareloo.LDR', TBRL.ldr, false);
        TBRL.ldr_plus_taberareloo = true;
      }
      window.addEventListener('Taberareloo.link', TBRL.link, false);
      window.addEventListener('Taberareloo.quote', TBRL.quote, false);
      window.addEventListener('Taberareloo.general', TBRL.general, false);
      !TBRL.config['post']['keyconfig'] && document.addEventListener('keydown', TBRL.keyhandler, false);
    },
    unload : function(){
      !TBRL.config['post']['keyconfig'] && document.removeEventListener('unload', TBRL.unload, false);
      document.removeEventListener('keydown', TBRL.handler, false);
      document.removeEventListener('mousemove', TBRL.mousehandler, false);
      window.removeEventListener('Taberareloo.link', TBRL.link, false);
      window.removeEventListener('Taberareloo.quote', TBRL.quote, false);
      window.removeEventListener('Taberareloo.general', TBRL.general, false);
      TBRL.ldr_plus_taberareloo && window.removeEventListener('Taberareloo.LDR', TBRL.ldr, false);
    },
    ldr : function(ev){
      var data = JSON.parse(ev.data);
      var target = ev.target;
      var body = $X('ancestor::div[starts-with(@id, "item_count")]/parent::div//div[@class="item_body"]', target)[0];
      var ctx = update({
          document  : document,
          window    : window,
          selection : '' + window.getSelection(),
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
    link : function(ev){
      return maybeDeferred(Extractors.Link.extract(TBRL.createContext()))
      .addCallback(function(ps){
        TBRL.openQuickPostForm(ps);
      });
    },
    quote: function(ev){
      return maybeDeferred(Extractors.Photo.extract(TBRL.createContext()))
      .addCallback(function(ps){
        TBRL.openQuickPostForm(ps);
      });
    },
    general: function(ev){
      var ctx = TBRL.createContext();
      var exts = Extractors.check(ctx);
      log(exts[0].name);
      if(exts.length){
        maybeDeferred(exts[0].extract(ctx))
        .addCallback(function(ps){
          TBRL.openQuickPostForm(ps);
        });
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
    createContext: function(){
      var ctx = update({
        document :document,
        window : window,
        title : document.title,
        selection : window.getSelection().toString(),
        target : TBRL.target || document
      }, window.location);
      if(ctx.target){
        ctx.link    = $X('./ancestor::a', ctx.target)[0];
        ctx.onLink  = !!ctx.link;
        ctx.onImage = ctx.target instanceof HTMLImageElement;
      }
      return ctx;
    },
    mousehandler : function(ev){
      // 監視
      TBRL.target = ev.target;
    },
    openQuickPostForm : function(ps){
      chrome.extension.sendRequest(id, {
        request: "quick",
        content: update({
          page    : document.title,
          pageUrl : location.href
        }, ps)
      }, function(res){ });
    },
    share: function(ctx, ext, show){
      maybeDeferred(ext.extract(ctx))
      .addCallback(function(ps){
        chrome.extension.sendRequest(id, {
          request: "share",
          show   : show,
          content: update({
            page    : document.title,
            pageUrl : location.href
          }, ps)
        }, function(res){ });
      });
    },
    getConfig : function(){
      var d = new Deferred();
      chrome.extension.sendRequest(id, {
        request: "config"
      }, function(res){
        d.callback(res);
      });
      return d;
    }
  }
  TBRL.getConfig().addCallback(TBRL.init);

  // Extractors
  var skin = chrome.extension.getURL('skin/');
  var Extractors = new Repository();
  Extractors.register([
    {
      name : 'LDR',
      getItem : function(ctx, getOnly){
        if(ctx.host !== 'reader.livedoor.com' && ctx.host !== 'fastladder.com')
          return;
        var item = $X('ancestor::div[starts-with(@id, "item_count")]', ctx.target)[0];
        if(!item)
          return;
        var channel = $X('id("right_body")/div[@class="channel"]//a', ctx.document)[0];

        var res = {
          author : ($X('descendant-or-self::div[@class="author"]/text()', item)[0] || '').extract(/by (.*)/),
          title  : $X('descendant-or-self::div[@class="item_header"]//a/text()', item)[0] || '',
          feed   : channel.textContent,
          href   : $X('(descendant-or-self::div[@class="item_info"]/a)[1]/@href', item)[0].replace(/[?&;](fr?(om)?|track|ref|FM)=(r(ss(all)?|df)|atom)([&;].*)?/,'') || channel.href
        };
        if(!getOnly){
          ctx.title = res.feed + (res.title? ' - ' + res.title : '');
          ctx.href  = res.href;
          ctx.host  = res.href.match(/http:\/\/(.*?)\//)[1];
        }
        return res;
      }
    },

    {
      name : 'Quote - LDR',
      ICON : 'http://reader.livedoor.com/favicon.ico',
      check: function(ctx){
        return Extractors.LDR.getItem(ctx, true) && ctx.selection;
      },
      extract: function(ctx){
        Extractors.LDR.getItem(ctx);
        return Extractors.Quote.extract(ctx);
      }
    },

    {
      name: 'ReBlog - LDR',
      ICON: 'http://reader.livedoor.com/favicon.ico',
      check: function(ctx){
        var item = Extractors.LDR.getItem(ctx, true);
        return item && (
          item.href.match(/^http:\/\/.*?\.tumblr\.com\//) ||
          (ctx.onImage && ctx.target.src.match(/^http:\/\/data\.tumblr\.com\//)));
      },
      extract: function(ctx){
        Extractors.LDR.getItem(ctx);
        return Extractors.ReBlog.extractByLink(ctx, ctx.href);
      }
    },

    {
      name: 'Photo - LDR',
      ICON: 'http://reader.livedoor.com/favicon.ico',
      check: function(ctx){
        return Extractors.LDR.getItem(ctx, true) && ctx.onImage;
      },
      extract: function(ctx){
        Extractors.LDR.getItem(ctx);
        return Extractors.check(ctx)[0].extract(ctx);
      }
    },

    {
      name: 'Link - LDR',
      ICON: 'http://reader.livedoor.com/favicon.ico',
      check: function(ctx){
        return Extractors.LDR.getItem(ctx, true);
      },
      extract: function(ctx){
        Extractors.LDR.getItem(ctx);
        return Extractors.Link.extract(ctx);
      }
    },

    {
      name: 'GoogleReader',
      getItem: function(ctx, getOnly){
        if(!ctx.href.match(/\/\/www\.google\.[^\/]+\/reader\//))
          return;
        var item = $X('ancestor-or-self::div[contains(concat(" ",@clas," ")," entry ")]', ctx.target);
        if(!item)
          return;
        var res = {
          author: ($X('descendant::div[@class="entry-author"]/*[@class="entry-author-name"]/text()', item)[0] || ''),
          title : $X('descendant::a[@class="entry-title-link"]/text()', item)[0] || '',
          feed  : ($X('descendant::a[@class="entry-source-title"]/text()', item)[0] || $X('id("chrome-stream-title")//a/text()', ctx.document)[0]),
          href  : $X('descendant::a[@class="entry-title-link"]/@href', item)[0].replace(/[?&;](fr?(om)?|track|ref|FM)=(r(ss(all)?|df)|atom)([&;].*)?/,'')
        };
        if(!getOnly){
          ctx.title = res.feed + (res.title? ' - ' + res.title : '');
          ctx.href  = res.href;
          ctx.host  = res.href.match(/http:\/\/(.*?)/)[1];
        }
        return res;
      }
    },

    {
      name: 'Quote - GoogleReader',
      ICON: 'http://www.google.com/reader/ui/favicon.ico',
      check: function(ctx){
        return Extractors.GoogleReader.getItem(ctx, true) && ctx.selection;
      },
      extract: function(ctx){
        Extractors.GoogleReader.getItem(ctx);
        return Extractors.Quote.extract(ctx);
      }
    },

    {
      name: 'ReBlog - GoogleReader',
      ICON: 'http://www.google.com/reader/ui/favicon.ico',
      check: function(ctx){
        var item = Extractors.GoogleReader.getItem(ctx, true);
        return item && (
          item.href.match(/^http:\/\/.*?\.tumblr\.com\//) ||
          (ctx.onImage && ctx.target.src.match(/^http:\/\/data\.tumblr\.com\//)));
      },
      extract: function(ctx){
        Extractors.GoogleReader.getItem(ctx);
        return Extractors.ReBlog.extractByLink(ctx, ctx.href);
      }
    },

    {
      name: 'Photo - GoogleReader',
      ICON: 'http://www.google.com/reader/ui/favicon.ico',
      check: function(ctx){
        return Extractors.GoogleReader.getItem(ctx, true) && ctx.onImage;
      },
      extract: function(ctx){
        Extractors.GoogleReader.getItem(ctx);
        return Extractors.check(ctx)[0].extract(ctx);
      }
    },

    {
      name: 'Link - GoogleReader',
      ICON: 'http://www.google.com/reader/ui/favicon.ico',
      check: function(ctx){
        return Extractors.GoogleReader.getItem(ctx, true);
      },
      extract: function(ctx){
        Extractors.GoogleReader.getItem(ctx);
        return Extractors.Link.extract(ctx);
      }
    },

    {
      name: 'ReBlog - Clipp',
      ICON: 'http://clipp.in/favicon.ico',
      CLIPP_URL: 'http://clipp.in/',
      check: function(ctx) {
        return this.getLink(ctx);
      },
      extract: function(ctx) {
        var link = this.getLink(ctx);
        if(!link)
          return {};

        var self = this;
        var endpoint = this.CLIPP_URL + 'bookmarklet' + link;
        return this.getForm(endpoint).addCallback(function(form) {
          return update({
            type: 'link',
            item: ctx.title,
            itemUrl: ctx.href,
            favorite: {
              name: 'Clipp',
              endpoint: endpoint,
              form: form
            }
          }, self.convertToParams(form));
        });
      },
      getForm: function(url, ignoreError) {
        return request(url).addCallback(function(res) {
          var doc = createHTML(res.responseText);
          var form = $X('//form', doc)[0];
          return formContents(form);
        });
      },
      checkEntryPage: function(ctx) {
        return /clipp.in\/entry\/\d+/.test(ctx.href);
      },
      getLink: function(ctx) {
        return this.checkEntryPage(ctx) ? this.getLinkByPage(ctx.document) : this.getLinkByTarget(ctx);
      },
      getLinkByPage: function(doc) {
        return $X('//a[contains(@href, "add?reblog=")]/@href', doc)[0];
      },
      getLinkByTarget: function(ctx) {
        return $X('./ancestor-or-self::div[contains(concat(" ", @class, " "), " item ")]//a[contains(@href, "add?reblog=")]/@href', ctx.target)[0];
      },
      convertToParams: function(form) {
        if (form.embed_code)
          return {
            type: 'video',
            item: form.title,
            itemUrl: form.address,
            body: form.embed_code
          };
        else if (form.image_address)
          return {
            type: 'photo',
            item: form.title,
            itemUrl: form.image_address
          };
        else if (form.quote && form.quote != '<br>')
          return {
            type: 'quote',
            item: form.title,
            itemUrl: form.address,
            body: form.quote
          };
        return {
          type: 'link',
          item: form.title,
          itemUrl: form.address
        };
      }
    },

    {
      name: 'Quote - Twitter',
      ICON: 'http://twitter.com/favicon.ico',
      check: function(ctx){
        return ctx.href.match(/\/\/twitter\.com\/.*?\/(?:status|statuses)\/\d+/);
      },
      extract: function(ctx){
        return (ctx.selection?
          succeed(ctx.selection) :
          request(ctx.href).addCallback(function(res){
            var doc = createHTML(res.responseText);
            var content = $X('(descendant::span[@class="entry-content"])[1]', doc)[0];
            $X('./descendant-or-self::a', content).forEach(function(l){
              l.href = resolveRelativePath(l.href, ctx.href);
            });
            body = content.innerHTML.
              replace(/ (?:rel|target)=".+?"/g, '').
              replace('<a href="' + ctx.href.replace('/statuses/', '/status/') + '">...</a>', '');
            return body;
          })
        ).addCallback(function(body){
          return {
            type : 'quote',
            item : ctx.title.substring(0, ctx.title.indexOf(': ')),
            itemUrl: ctx.href,
            body : body.trim(),
            favorite : {
              name : 'Twitter',
              id   : ctx.href.match(/(?:status|statuses)\/(\d+)/)[1]
            }
          };
        });
      }
    },

    {
      name : 'Quote - inyo.jp',
      ICON : skin+'quote.png',
      check: function(ctx){
        return ctx.href.match(/\/\/inyo\.jp\/quote\/[a-f\d]+/);
      },
      extract: function(ctx){
        return {
          type : 'quote',
          item : $X('//span[@class="title"]/text()', ctx.document)[0],
          itemUrl: ctx.href,
          body : escapeHTML((ctx.selection || $X('//blockquote[contains(@class, "text")]/p/text()', ctx.document)[0]).trim())
        };
      }
    },

    {
      name : 'Amazon',
      getAsin: function(ctx){
        return $X('id("ASIN")/@value')[0];
      },
      extract: function(ctx){
        var asin = this.getAsin(ctx);
        // FIXME
      }
    },

    {
      name : 'ReBlog',
      TUMBLR_URL : 'http://www.tumblr.com/',
      extractByLink : function(ctx, link){
        var self = this;
        return request(link).addCallback(function(res){
          var text = res.responseText;
          var doc = createHTML(res.responseText);
          ctx.href = link;
          var m = text.match(/<title(?:\s[^>]+?)?>([\S\s]*?)<\/title\s*>/i);
          ctx.title = ((m)? m[1] : '').replace(/[\n\r]/g, '');
          return self.extractByPage(ctx, doc);
        });
      },
      getForm : function(url){
        var self = this;
        return request(url).addCallback(function(res){
          var doc = createHTML(res.responseText);
          var form = formContents($X('//form', doc)[1]);
          delete form.preview_post;
          form.redirect_to = self.TUMBLR_URL+'dashboard';
          if(form.reblog_post_id){
            // self.trimReblogInfo(form);
            // Tumblrから他サービスへポストするため画像URLを取得しておく
            if(form['post[type]']==='photo')
              form.image = $X('id("edit_post")//img[contains(@src, "media.tumblr.com/") or contains(@src, "data.tumblr.com/")]/@src', doc)[0];
          }
          return form;
        });
      },
      extractByPage : function(ctx, doc){
        return this.extractByEndpoint(ctx,
          unescapeHTML(this.getFrameUrl(doc)).replace(/.+&pid=(.*)&rk=(.*)/, this.TUMBLR_URL+'reblog/$1/$2'));
      },
      extractByEndpoint : function(ctx, endpoint){
        var self = this;
        return this.getForm(endpoint).addCallback(function(form){
          return update({
            type     : form['post[type]'],
            item     : ctx.title,
            itemUrl  : ctx.href,
            favorite : {
              name     : 'Tumblr',
              endpoint : endpoint,
              form     : form
            }
          }, self.convertToParams(form));
        });
      },
      getFrameUrl : function(doc){
        var elm = $X('//iframe[starts-with(@src, "http://www.tumblr.com/dashboard/iframe") and contains(@src, "pid=")]/@src', doc);
        if(elm.length){
          return elm[0];
        } else {
          return null;
        }
      },
      convertToParams  : function(form){
        switch(form['post[type]']){
        case 'regular':
          return {
            type    : 'quote',
            item    : form['post[one]'],
            body    : form['post[two]']
          }
        case 'photo':
          return {
            itemUrl : form.image,
            body    : form['post[two]']
          }
        case 'link':
          return {
            item    : form['post[one]'],
            itemUrl : form['post[two]'],
            body    : form['post[three]']
          };
        case 'quote':
          // FIXME: post[two]検討
          return {
            body    : form['post[one]']
          };
        case 'video':
          // FIXME: post[one]検討
          return {
            body    : form['post[two]']
          };
        case 'conversation':
          return {
            item : form['post[one]'],
            body : form['post[two]']
          };
        }
      }
    },

    {
      name : 'ReBlog - Tumblr',
      ICON : skin+'reblog.ico',
      check : function(ctx){
        return Extractors.ReBlog.getFrameUrl(ctx.document);
      },
      extract : function(ctx){
        return Extractors.ReBlog.extractByPage(ctx, ctx.document);
      }
    },

    {
      name : 'ReBlog - Dashboard',
      ICON : skin+'reblog.ico',
      check : function(ctx){
        return (/(tumblr-beta\.com|tumblr\.com)\//).test(ctx.href) && this.getLink(ctx);
      },
      extract : function(ctx){
        // タイトルなどを取得するためextractByLinkを使う(reblogリンクを取得しextractByEndpointを使った方が速い)
        return Extractors.ReBlog.extractByLink(ctx, this.getLink(ctx));
      },
      getLink : function(ctx){
        var link = $X('./ancestor-or-self::li[starts-with(normalize-space(@class), "post")]//a[@title="Permalink"]', ctx.target)[0];
        return link && link.href;
      }
    },

    {
      name : 'ReBlog - Tumblr Dashboard for iPhone',
      ICON : skin+'reblog.ico',
      getLink: function(ctx){
        var link = $X('./ancestor-or-self::li[starts-with(normalize-space(@id), "post")]//a[contains(concat(" ",normalize-space(@class)," ")," permalink ")]', ctx.target);
        return link && link.href;
      },
      check: function(ctx){
        return (/tumblr\.com\/iphone/).test(ctx.href) && this.getLink(ctx);
      },
      extract: function(ctx){
        return Extractors.ReBlog.extractByLink(ctx, this.getLink(ctx));
      }
    },

    {
      name: 'ReBlog - Tumblr link',
      ICON: skin+'reblog.ico',
      check : function(ctx){
        return ctx.link && ctx.link.href && ctx.link.href.match(/^http:\/\/[^.]+\.tumblr\.com\/post\/\d+/);
      },
      extract: function(ctx){
        return Extractors.ReBlog.extractByLink(ctx, ctx.link.href);
      }
    },

    {
      name : 'Photo - image link',
      ICON : skin+'photo.png',
      check : function(ctx){
        if(!ctx.onLink)
          return false;

        var uri = ctx.link.href;
        return uri && (/[^\/]*\.(?:png|gif|jpe?g)$/i).test(uri);
      },
      extract : function(ctx){
        ctx.target = ctx.link;

        return Extractors.Photo.extract(ctx);
      }
    },

    // Photo Data URI

    {
      name : 'Photo',
      ICON : skin+'photo.png',
      PROTECTED_SITES : [
        'files.posterous.com/',
        'image.itmedia.co.jp/',
        'wretch.yimg.com/',
        'pics.*\.blog.yam.com/',
        '/www.imgscan.com/image_c.php',
        'keep4u.ru/imgs/',
        '/www.toofly.com/userGallery/',
        '/www.dru.pl/',
        'adugle.com/shareimagebig/',
        '/awkwardfamilyphotos.com/',
        'share-image.com/pictures/big/'
      ],
      check : function(ctx){
        return ctx.onImage;
      },
      extract : function(ctx){
        var target = ctx.target;
        var tag = tagName(target);
        var source =
          tag==='object'? target.data :
          tag==='img'? target.src : target.href;

        /*
        if(this.PROTECTED_SITES.some(function(re){
          return RegExp(re).test(source);
        })){
          return Tombloo.Service.extractors['Photo - Upload from Cache'].extract(ctx);
        };
        */

        // FIXME
        var m = ctx.title.match(/([^\/\s]+) \(\d+×\d+\)$/);
        if(m){
          ctx.title = m[1];
        }

        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : source
        }
      }
    },

    {
      name : 'Video - Vimeo',
      ICON : 'http://vimeo.com/favicon.ico',
      check : function(ctx){
        return ctx.host.match(/vimeo\.com/);
      },
      extract : function(ctx){
        var author = $X('//div[@class="byline"]/a')[0];
        return {
          type      : 'video',
          item      : $X('//div[@class="title"]/text()')[0].trim(),
          itemUrl   : ctx.href,
          author    : author.textContent,
          authorUrl : author.href
        };
      }
    },

    {
      name : 'Video - YouTube',
      ICON : 'http://youtube.com/favicon.ico',
      check : function(ctx){
        return ctx.host.match(/youtube\.com/);
      },
      extract : function(ctx){
        var author = $X('id("watch-channel-stats")/a')[0];
        return {
          type      : 'video',
          item      : ctx.title.extract(/\s- (.*)/),
          itemUrl   : ctx.href,
          author    : author.textContent,
          authorUrl : author.href
        };
      }
    },

    {
      name : 'Video - Google Video',
      ICON : 'http://www.google.com/favicon.ico',
      check : function(ctx){
        return ctx.host.match(/video\.google\.com/);
      },
      extract : function(ctx){
        return {
          type    : 'video',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : $X('id("embed-video")/textarea/text()', ctx.document)[0]
        }
      }
    },

    {
      name : 'Video - MySpaceTV',
      ICON : 'http://vids.myspace.com/favicon.ico',
      check : function(ctx){
        return ctx.host.match(/vids\.myspace\.com/) && this.getTag(ctx);
      },
      extract : function(ctx){
        var tag = this.getTag(ctx);
        ctx.href = tag.extract(/href="(.+?)"/);

        return {
          type    : 'video',
          item    : tag.extract(/>(.+?)<\/a>/),
          itemUrl : ctx.href,
          body    : tag.extract(/(<object.+object>)/)
        };
      },
      getTag : function(ctx){
        return $X('id("links_video_code")/@value', ctx.document)[0];
      }
    },

    {
      name : 'Video - Dailymotion',
      ICON : 'http://www.dailymotion.com/favicon.ico',
      check : function(ctx){
        return ctx.host.match(/dailymotion\.com/) && this.getTag(ctx);
      },
      extract : function(ctx){
        var tag = this.getTag(ctx);
        var author = tag.extract(/Uploaded by (<a.+?a>)/);
        ctx.href = tag.extract(/href="(.+?)"/);

        return {
          type      : 'video',
          item      : ctx.title.extract(/Dailymotion - (.*?), a video from/),
          itemUrl   : ctx.href,
          author    : author.extract(/>([^><]+?)</),
          authorUrl : author.extract(/href="(.+?)"/),
          body      : tag.extract(/(<object.+object>)/)
        };
      },
      getTag : function(ctx){
        return $X('id("video_player_embed_code_text")/text()', ctx.document)[0];
      }
    },

    {
      name : 'Video - Rimo',
      ICON : 'http://rimo.tv/favicon.ico',
      check : function(ctx){
        return ctx.host === 'rimo.tv' && this.getTag(ctx);
      },
      extract : function(ctx){
        return {
          type    : 'video',
          item    : $X('id("play_list_title")/@value', ctx.document) || ctx.title.extract(/ - (.*)/),
          itemUrl : ctx.href,
          body    : this.getTag(ctx)
        };
      },
      getTag : function(ctx){
        return $X('id("player-tag-M")/@value', ctx.document)[0] || $X('(//table[@class="player-embed-tags"]//input)[last()]/@value', ctx.document)[0];
      }
    },

    {
      name : 'Video - Nico Nico Douga',
      ICON : 'http://www.nicovideo.jp/favicon.ico',
      check : function(ctx){
        return ctx.href.match(/^http:\/\/www\.nicovideo\.jp\/watch\//);
      },
      extract : function(ctx){
        return {
          type    : 'video',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : $X('//form[@name="form_iframe"]/input/@value', ctx.document)[0]
        };
      }
    },

    {
      name : 'Quote',
      ICON : skin+'quote.png',
      check : function(ctx){
        return ctx.selection;
      },
      extract : function(ctx){
        return {
          type    : 'quote',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : escapeHTML(ctx.selection.trim())
        }
      }
    },

    {
      name : 'Link',
      ICON : skin+'link.png',
      check : function(ctx){
        return true;
      },
      extract : function(ctx){
        return {
          type    : 'link',
          item    : ctx.title,
          itemUrl : ctx.href
        }
      }
    },

    {
      name : 'Photo - background image',
      ICON : skin+'photo.png',
      check : function(ctx){
        return ctx.bgImageURL;
      },
      extract : function(ctx){
        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : ctx.bgImageURL
        }
      }
    },

    {
      name : 'Text',
      ICON : skin+'text.png',
      check : function(ctx){
        return true;
      },
      extract : function(ctx){
        return {
          type : 'regular'
        }
      }
    }
  ]);

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
        var ctx = update({
          document :document,
          window : window,
          title : title,
          selection : window.getSelection().toString(),
          target : TBRL.target || document
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
})();
