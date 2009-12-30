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
    name : 'Photo - 4u',
    ICON : 'http://static.straightline.jp/html/common/static/favicon.ico',
    check : function(ctx){
      return ctx.onImage &&
        ctx.href.match(/^http:\/\/4u\.straightline\.jp\/image\//) &&
        ctx.target.src.match(/\/static\/upload\/l\/l_/);
    },
    extract : function(ctx){
      var author = $X('(//div[@class="entry-information"]//a)[1]', ctx.document)[0];
      var iLoveHer = $X('//div[@class="entry-item fitem"]//a/@href', ctx.document)[0];
      return {
        type      : 'photo',
        item      : ctx.title.extract(/(.*) - 4U/i),
        itemUrl   : ctx.target.src,
        author    : author.textContent.trim(),
        authorUrl : author.href,
        favorite : {
          name : '4u',
          id : iLoveHer && decodeURIComponent(iLoveHer.extract('src=([^&]*)'))
        }
      };
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
      if(ctx.target && ctx.document){
        var bg = Extractors['Photo - background image'].lookupBG(ctx.target, ctx.document);
        var m = bg.match(/url\s*\(\s*['"]?\s*(https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+)\s*['"]?\s*\)/);
        if(m) ctx.bgImageURL = m[1];
      }
      return ctx.bgImageURL;
    },
    lookupBG: function(elm, doc){
      return (function(target){
        var bg = getComputedStyle(elm, '').backgroundImage;
        if(bg){
          return bg;
        } else {
          var parent = elm.parentNode;
          if(parent === doc){
            return null;
          } else {
            return arguments.callee(parent);
          }
        }
      })(elm);
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

