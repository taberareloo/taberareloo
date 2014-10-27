/*global chrome:true, Repository:true, $X:true, createURI:true*/
/*global createFlavoredString:true, $A:true, TBRL:true, request:true*/
/*global update:true, $N:true, promiseAllHash:true, defer:true*/
/*global queryHash:true, unescapeHTML:true, getFileExtension:true*/
/*global getStyle:true, tagName:true, downloadFile:true, $D:true, $T:true*/
/*global base64ToFileEntry:true, cancel:true, keyString:true, setStyle:true*/
/*global getElementDimensions:true, getViewportDimensions:true, getPageDimensions:true*/
(function (exports) {
  'use strict';

  var skin = chrome.runtime.getURL('skin/');
  var Extractors = exports.Extractors = new Repository();

  Extractors.register([
    {
      name : 'LDR',
      getItem : function (ctx, getOnly) {
        if (ctx.host !== 'reader.livedoor.com' && ctx.host !== 'fastladder.com') {
          return null;
        }

        var item = $X('ancestor-or-self::div[starts-with(@id, "item_count")]', ctx.target)[0];
        if (!item) {
          return null;
        }

        var channel = $X('id("right_body")/div[@class="channel"]//a', ctx.document)[0];

        var res = {
          author : ($X('descendant-or-self::div[@class="author"]/text()', item)[0] || '').extract(/by (.*)/),
          title  : $X('descendant-or-self::div[@class="item_header"]//a/text()', item)[0] || '',
          feed   : channel.textContent,
          href   : $X('(descendant-or-self::div[@class="item_info"]/a)[1]/@href', item)[0].replace(/[?&;](fr?(om)?|track|ref|FM)=(r(ss(all)?|df)|atom)([&;].*)?/, '') || channel.href
        };
        var uri = createURI(res.href);

        if (!getOnly) {
          ctx.title = res.feed + (res.title ? ' - ' + res.title : '');
          ctx.href  = res.href;
          ctx.host  = uri.host;
        }
        return res;
      }
    },

    {
      name : 'Quote - LDR',
      ICON : 'http://reader.livedoor.com/favicon.ico',
      check: function (ctx) {
        return Extractors.LDR.getItem(ctx, true) && ctx.selection;
      },
      extract: function (ctx) {
        Extractors.LDR.getItem(ctx);
        return Extractors.Quote.extract(ctx);
      }
    },

    {
      name: 'ReBlog - LDR',
      ICON: 'http://reader.livedoor.com/favicon.ico',
      check: function (ctx) {
        var item = Extractors.LDR.getItem(ctx, true);
        return item && (
          item.href.match(/^http:\/\/.*?\.tumblr\.com\//) ||
          (ctx.onImage && ctx.target.src.match(/^http:\/\/data\.tumblr\.com\//)));
      },
      extract: function (ctx) {
        Extractors.LDR.getItem(ctx);
        return Extractors.ReBlog.extractByLink(ctx, ctx.href);
      }
    },

    {
      name: 'Photo - LDR',
      ICON: 'http://reader.livedoor.com/favicon.ico',
      check: function (ctx) {
        return Extractors.LDR.getItem(ctx, true) && ctx.onImage;
      },
      extract: function (ctx) {
        Extractors.LDR.getItem(ctx);
        return Extractors.check(ctx)[0].extract(ctx);
      }
    },

    {
      name: 'Link - LDR',
      ICON: 'http://reader.livedoor.com/favicon.ico',
      check: function (ctx) {
        return Extractors.LDR.getItem(ctx, true);
      },
      extract: function (ctx) {
        Extractors.LDR.getItem(ctx);
        return Extractors.Link.extract(ctx);
      }
    },

    {
      name: 'Quote - Twitter',
      ICON: 'http://twitter.com/favicon.ico',
      check: function (ctx) {
        return ctx.href.match(/\/\/twitter\.com\/.*?\/(?:status|statuses)\/\d+/);
      },
      extract: function (ctx) {
        var res = {
          type     : 'quote',
          item     : ctx.title.substring(0, ctx.title.indexOf(': ')),
          itemUrl  : ctx.href,
          favorite : {
            name : 'Twitter',
            id   : ctx.href.match(/(status|statuses)\/(\d+)/)[2]
          }
        };
        if (ctx.selection) {
          res.body = ctx.selection.raw;
          res.flavors = {
            html : ctx.selection.html
          };
        } else {
          var elm = ctx.document.querySelector('.tweet-text');
          var cloneElm = elm.cloneNode(true);
          $A(cloneElm.getElementsByClassName('tco-ellipsis'))
            .forEach(function (target) {
            target.parentNode.removeChild(target);
          });
          var sel = createFlavoredString(cloneElm);
          res.body = sel.raw;
          res.flavors = {
            html : sel.html
          };
        }
        return res;
      }
    },

    {
      name : 'Quote - inyo.jp',
      ICON : skin + 'quote.png',
      check: function (ctx) {
        return ctx.href.match(/\/\/inyo\.jp\/quote\/[a-f\d]+/);
      },
      extract: function (ctx) {
        var res = {
          type     : 'quote',
          item     : $X('//span[@class="title"]/text()')[0],
          itemUrl  : ctx.href
        };
        if (ctx.selection) {
          res.body = ctx.selection.raw;
          res.flavors = {
            html : ctx.selection.html
          };
        } else {
          var sel = createFlavoredString($X('//blockquote[contains(@class, "text")]/p')[0]);
          res.body = sel.raw;
          res.flavors = {
            html : sel.html
          };
        }
        return res;
      }
    },

    {
      name : 'Amazon',
      getAsin : function (ctx) {
        return $X('id("ASIN")/@value', ctx.document)[0];
      },
      normalizeUrl : function (host, asin) {
        return  'http://' + host + '/o/ASIN/' + asin +
          (this.affiliateId ? '/' + this.affiliateId + '/ref=nosim' : '');
      },
      get affiliateId() {
        return TBRL.config.entry.amazon_affiliate_id;
      },
      preCheck : function (ctx) {
        return ctx.host.match(/amazon\./) && this.getAsin(ctx);
      },
      extract : function (ctx) {
        ctx.href = this.normalizeUrl(ctx.host, this.getAsin(ctx));
        var pi = $X('id("prodImage")/@alt', ctx.document)[0];
        pi = (!! pi) ? pi + ': ' : '';
        var ti = $X('id("btAsinTitle")/text()', ctx.document);
        ctx.title = 'Amazon: ' + pi + ti;

        // 日本に特化(comの取得方法不明)
        var date = new Date(ctx.document.body.innerHTML.extract('発売日：.*?</b>.*?([\\d/]+)'));
        if (!isNaN(date)) {
          ctx.date = date;
        }
      }
    },

    {
      name : 'Photo - Amazon',
      ICON : 'http://www.amazon.com/favicon.ico',
      check : function (ctx) {
        return Extractors.Amazon.preCheck(ctx) && ($X('./ancestor::*[@id="main-image-relative-container"]', ctx.target)[0] ||
            $X('./ancestor::*[@id="iv-large-image"]', ctx.target)[0]);
      },
      extract : function (ctx) {
        Extractors.Amazon.extract(ctx);

        var url = ctx.target.src.split('.');
        if (url.length > 4) {
          url.splice(-2, 1, 'LZZZZZZZ');
        }
        url = url.join('.').replace('.L.LZZZZZZZ.', '.L.'); // カスタマーイメージ用

        ctx.target.src = url;
        ctx.target.height = '';
        ctx.target.width = '';

        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : url
        };
      }
    },

    {
      name : 'Quote - Amazon',
      ICON : 'http://www.amazon.com/favicon.ico',
      check : function (ctx) {
        return Extractors.Amazon.preCheck(ctx) && ctx.selection;
      },
      extract : function (ctx) {
        Extractors.Amazon.extract(ctx);
        return Extractors.Quote.extract(ctx);
      }
    },

    {
      name : 'Link - Amazon',
      ICON : 'http://www.amazon.com/favicon.ico',
      check : function (ctx) {
        return Extractors.Amazon.preCheck(ctx);
      },
      extract : function (ctx) {
        Extractors.Amazon.extract(ctx);
        return Extractors.Link.extract(ctx);
      }
    },

    {
      name : 'Photo - Flickr',
      ICON : 'http://www.flickr.com/favicon.ico',

      API_KEY : 'ecf21e55123e4b31afa8dd344def5cc5',
      RE : new RegExp('^https?://(?:.+?.)?static.?flickr.com/\\d+?(?:/\\d+?)?/(\\d+?)_.*'),
      getImageId : function (ctx) {
        // 他サイトに貼られているFlickrにも対応する
        if (/flickr\.com/.test(ctx.host)) {
          // ログインしているとphoto-drag-proxyが前面に表示される
          // アノテーション上の場合はphoto_notesの孫要素となる
          if ($X('./ancestor-or-self::div[@id="content"]//div[contains(concat(" ",normalize-space(@class)," "), " photo-well-view ") or contains(concat(" ",normalize-space(@class)," "), " photo-well-scrappy-view ")]', ctx.target)) {
            ctx.target = $X('//div[@id="content"]//div[contains(concat(" ",normalize-space(@class)," "), " photo-well-media-view ") or contains(concat(" ",normalize-space(@class)," "), " photo-well-media-scrappy-view ")]/img')[0] || ctx.target;

          } else if (
              (ctx.target.src && ctx.target.src.match('spaceball.gif')) ||
              ctx.target.id === 'photo-drag-proxy' ||
              $X('./ancestor-or-self::div[@id="photo-drag-proxy"]', ctx.target)
          ) {
            ctx.target = $X('//div[@class="photo-div"]/img')[0] || ctx.target;
          }
        }

        if (!ctx.target || !ctx.target.src || !ctx.target.src.match(this.RE)) {
          return;
        }

        return RegExp.$1;
      },
      check : function (ctx) {
        return this.getImageId(ctx);
      },
      callMethod : function (ps) {
        return request('http://flickr.com/services/rest/', {
          queryString : update({
            api_key        : this.API_KEY,
            nojsoncallback : 1,
            format         : 'json',
            responseType   : 'json'
          }, ps)
        }).then(function (res) {
          var json = res.response;
          if (json.stat !== 'ok') {
            throw json.message;
          }
          return json;
        });
      },
      getSizes : function (id) {
        return this.callMethod({
          method   : 'flickr.photos.getSizes',
          photo_id : id,
        }).then(function (res) {
          return res.sizes.size;
        });
      },
      getInfo : function (id) {
        return this.callMethod({
          method   : 'flickr.photos.getInfo',
          photo_id : id,
        }).then(function (res) {
          return res.photo;
        });
      },
      extract : function (ctx) {
        var id = this.getImageId(ctx);
        return promiseAllHash({
          'info'  : this.getInfo(id),
          'sizes' : this.getSizes(id),
        }).then(function (r) {
          var info = r.info;
          var sizes = r.sizes;

          var title = info.title._content;
          ctx.title = title + ' on Flickr';
          ctx.href  = info.urls.url[0]._content;

          var thumbnailSize;
          if (sizes.length >= 6) {
            thumbnailSize = sizes[6]; // may be 'Small'
          } else {
            thumbnailSize = sizes[sizes.length - 1];
          }
          var largestSize;
          if ((info.rotation - 0) === 0) {
            largestSize = sizes.pop();
          } else {
            sizes.pop();
            largestSize = sizes.pop();
          }

          return {
            type      : 'photo',
            item      : title,
            itemUrl   : largestSize.source,
            author    : info.owner.username,
            authorUrl : ctx.href.extract('^(http://.*?flickr.com/photos/.+?/)'),
            license   : info.license,
            date      : info.dates.taken,
            thumbnailUrl   : thumbnailSize.source,
            originalWidth  : largestSize.width,
            originalHeight : largestSize.height,
          };
        }).catch(function () {
          return Extractors.Photo.extract(ctx);
        });
      },
    },

    {
      name : 'ReBlog',
      TUMBLR_URL : 'https://www.tumblr.com/',
      extractByLink : function (ctx, link) {
        var that = this;
        return request(link, {responseType: 'document'}).then(function (res) {
          var doc = res.response;
          ctx.href = link;
          ctx.title = doc.title;
          return that.extractByPage(ctx, doc);
        });
      },
      getForm : function (ctx, url) {
        var that = this;
        return request(this.TUMBLR_URL + 'svc/post/fetch', {
          headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
          sendContent: JSON.stringify({
            form_key: this.form_key,
            reblog_id: ctx.reblog_id,
            reblog_key: ctx.reblog_key,
            post_type: ctx.post_type
          }),
          responseType: 'json'
        }).then(function (res) {
          var response = res.response;
          var post = response.post;
          var form = {
            form_key: that.form_key,
            channel_id: that.channel_id,
            detached: true,
            reblog: true,
            reblog_id: ctx.reblog_id,
            reblog_key: ctx.reblog_key,
            errors: false,
            created_post: true,
            context_page: 'dashboard',
            post_context_page: response.post_context_page,
            silent: true,
            context_id: '',
            reblog_post_id: post.reblog_source.split('/post/')[1].split('/')[0],
            'is_rich_text[one]': '0',
            'is_rich_text[two]': '0',
            'is_rich_text[three]': '0',
            'post[slug]': post.slug,
            'post[source_url]': post.source_url || 'http://',
            'post[date]': '',
            'post[type]': post.type,
            'post[one]': post.one,
            'post[two]': post.two,
            'post[three]': post.three,
            'post[tags]': post.tags || '',
            'post[publish_on]': '',
            'post[state]': String(post.state),
            custom_tweet: '',
            allow_photo_replies: '',
            send_to_fbog: TBRL.config.entry.tumblr2facebook ? 'on' : '',
            send_to_twitter: TBRL.config.entry.tumblr2twitter ? 'on' : ''
          };

          if (post.type === 'photo') {
            form['post[photoset_layout]'] = post.photoset_layout;
            form['post[photoset_order]'] = [];
            post.photos.forEach(function (photo) {
              var id = photo.id;
              form['post[photoset_order]'].push(id);
              form['images[' + id + ']'] = '';
            });
            form['post[photoset_order]'] = form['post[photoset_order]'].join(',');
            form.image = post.photos[0].url;
          } else if (post.type === 'audio') {
            form['id3_tags[album]'] = post.id3_tags.Album || '';
            form['id3_tags[artist]'] = post.id3_tags.Artist || '';
            form['id3_tags[title]'] = post.id3_tags.Title || '';
            form.album_art = '';
            form.pre_upload = '';
            form.preuploaded_url = '';
            form.remove_album_art = '';
          } else if (post.type === 'video') {
            form.keep_video = '';
            form.pre_upload = '';
            form.preuploaded_ch = '';
            form.preuploaded_url = '';
            form.valid_embed_code = '';
          }

          return defer().then(function afterPhoto() {
            if (!(TBRL.config.entry.not_convert_text && form['post[type]'] === 'link')) {
              return form;
            }
            return request($N('a', {href: ctx.href}).origin + '/api/read', {
              queryString: {
                id: ctx.reblog_id
              }
            }).then(function (res) {
              var xml = res.responseXML;
              if (xml.querySelector('post').getAttribute('type') === 'regular') {
                ctx.post_type = 'text';
                return that.getForm(ctx, url);
              }
              return form;
            });
          });
        }).catch(function (err) {
          if (that.retry) {
            throw err;
          }

          that.form_key = that.channel_id = null;

          return that.getCache(true).then(function (info) {
            that.form_key = info.form_key;
            that.channel_id = info.channel_id;
            that.retry = true;

            return that.extractByEndpoint(ctx, url);
          });
        });
      },
      getFormKeyAndChannelId : function () {
        var that = this;

        if (this.form_key && this.channel_id) {
          return defer();
        }

        return this.getCache(false).then(function (info) {
          that.form_key = info.form_key;
          that.channel_id = info.channel_id;
        });
      },
      getCache : function (cacheClear) {
        return new Promise(function (resolve) {
          chrome.runtime.sendMessage(TBRL.id, {
            request: 'getCachedTumblrInfo',
            cacheClear: cacheClear
          }, resolve);
        });
      },
      extractByPage : function (ctx, doc) {
        var that = this;
        if (!(ctx.reblog_id && ctx.reblog_key)) {
          var params = queryHash(unescapeHTML(this.getFrameUrl(doc)));
          if (!params.pid && /^http:\/\/[^.]+\.tumblr\.com\/post\/\d+/.test(doc.URL)) {
            var anchor = $N('a', {href: doc.URL});
            return request(anchor.origin + '/api/read', {
              queryString: {
                id: anchor.pathname.replace('/post/', '')
              }
            }).then(function (res) {
              var xml = res.responseXML;
              var post = xml.querySelector('post');
              ctx.reblog_id = post.getAttribute('id');
              ctx.reblog_key = post.getAttribute('reblog-key');
              return that.extractByPage(ctx, doc);
            });
          }
          ctx.reblog_id = params.pid;
          ctx.reblog_key = params.rk;
        }
        if (!ctx.post_type) {
          ctx.post_type = false;
        }
        return this.getFormKeyAndChannelId().then(function () {
          return that.extractByEndpoint(ctx, that.TUMBLR_URL + 'reblog/' + ctx.reblog_id + '/' + ctx.reblog_key);
        });
      },
      extractByEndpoint : function (ctx, endpoint) {
        var that = this;
        return this.getForm(ctx, endpoint).then(function (form) {
          if (form.favorite) {
            return form;
          }
          if (that.retry) {
            that.retry = false;
          }
          var result = update({
            type     : form['post[type]'],
            item     : ctx.title,
            itemUrl  : ctx.href,
            favorite : {
              name     : 'Tumblr',
              endpoint : endpoint,
              form     : form
            }
          }, that.convertToParams(form));
          return result;
        });
      },
      getFrameUrl : function (doc) {
        var tumblr_controls = doc.querySelector('iframe#tumblr_controls');
        if (tumblr_controls && queryHash(tumblr_controls.src).pid) {
          return tumblr_controls.src;
        }

        var url = doc.body.textContent.extract(/(?:<|\\x3c)iframe\b[\s\S]*?src\s*=\s*(["']|\\x22)(http:\/\/(?:www|assets)\.tumblr\.com\/.*?iframe.*?)\1/i, 2);
        if (queryHash(url).pid) {
          return url.replace(/\\x26/g, '&');
        }

        return '';
      },
      convertToParams  : function (form) {
        switch (form['post[type]']) {
        case 'regular':
          return {
            type    : 'quote',
            item    : form['post[one]'],
            body    : form['post[two]']
          };
        case 'photo':
          return {
            itemUrl : form.image,
            body    : form['post[two]']
          };
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
        case 'audio':
          return {
            body    : form['post[two]'],
            itemUrl : ''
          };
        }
        return null;
      }
    },

    {
      name : 'ReBlog - Tumblr',
      ICON : skin + 'reblog.ico',
      check : function (ctx) {
        return Extractors.ReBlog.getFrameUrl(ctx.document);
      },
      extract : function (ctx) {
        return Extractors.ReBlog.extractByPage(ctx, ctx.document);
      }
    },

    {
      name : 'ReBlog - Dashboard',
      ICON : skin + 'reblog.ico',
      check : function (ctx) {
        if (!(/(tumblr-beta\.com|tumblr\.com)\//).test(ctx.href)) {
          return false;
        }
        var link = $X('./ancestor-or-self::div[starts-with(@id, "post_")]//a[starts-with(@id, "permalink_")]', ctx.target)[0];
        return link && link.href;
      },
      extract : function (ctx) {
        var post = $X('./ancestor-or-self::*[starts-with(@id,"post_")]', ctx.target)[0];

        ctx.title      = $X('.//a[@class="post_avatar_link"]/@title', post)[0];
        ctx.href       = $X('.//a[@class="post_permalink"]/@href', post)[0];
        ctx.form_key   = $X('.//input[@name="form_key"]/@value', post)[0];
        ctx.reblog_id  = post.getAttribute('data-post-id');
        ctx.reblog_key = post.getAttribute('data-reblog-key');
        ctx.post_type  = post.getAttribute('data-type');
        if (TBRL.config.entry.not_convert_text && ctx.post_type === 'regular') {
          ctx.post_type = 'text';
        }

        var ReBlog = Extractors.ReBlog;
        return ReBlog.getFormKeyAndChannelId().then(function () {
          return ReBlog.extractByEndpoint(ctx, ReBlog.TUMBLR_URL + 'reblog/' + ctx.reblog_id + '/' + ctx.reblog_key);
        });
      }
    },

    {
      name : 'ReBlog - Tumblr Dashboard for iPhone',
      ICON : skin + 'reblog.ico',
      getLink: function (ctx) {
        var link = $X('./ancestor-or-self::li[starts-with(normalize-space(@id), "post")]//a[contains(concat(" ",normalize-space(@class)," ")," permalink ")]', ctx.target);
        return link && link.href;
      },
      check: function (ctx) {
        return (/tumblr\.com\/iphone/).test(ctx.href) && this.getLink(ctx);
      },
      extract: function (ctx) {
        return Extractors.ReBlog.extractByLink(ctx, this.getLink(ctx));
      }
    },

    {
      name: 'ReBlog - Tumblr link',
      ICON: skin + 'reblog.ico',
      check : function (ctx) {
        return ctx.link && ctx.link.href && ctx.link.href.match(/^http:\/\/[^.]+\.tumblr\.com\/post\/\d+/);
      },
      extract: function (ctx) {
        return Extractors.ReBlog.extractByLink(ctx, ctx.link.href);
      }
    },

    {
      name : 'Photo - Google Book Search',
      ICON : 'http://www.google.com/favicon.ico',
      check : function (ctx) {
        if (!(/^books\.google\./).test(ctx.host)) {
          return null;
        }
        return !!this.getImage(ctx);
      },
      extract : function (ctx) {
        ctx.target = this.getImage(ctx);
        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : ctx.target.src
        };
      },
      getImage : function (ctx) {
        // 標準モード
        var img = $X('./ancestor::div[@class="pageImageDisplay"]//img[contains(@src, "//books.google.")]', ctx.target)[0];
        if (img) {
          return img;
        }

        // HTMLモード
        var div = $X('./ancestor::div[@class="html_page_image"]', ctx.target)[0];
        if (div) {
          return $N('img', {
            src: getStyle(div, 'background-image').replace(/url\((.*)\)/, '$1')
          });
        }
        return null;
      }
    },

    {
      name : 'Photo - 4u',
      ICON : skin + '4u.ico',
      check : function (ctx) {
        return ctx.onImage &&
          ctx.hostname === '4u-beautyimg.com' &&
          ctx.target.src.match(/\/thumb\/l\/l_/);
      },
      extract : function (ctx) {
        var iLoveHer = $X('./ancestor::li//span[starts-with(@id, "love-her-")]/a/@href', ctx.target)[0];
        var source;
        if (iLoveHer) {
          source = decodeURIComponent(iLoveHer.extract('src=([^&]*)'));
        }
        if (ctx.onLink && !/^\/image\//.test(ctx.pathname)) {
          ctx.href = ctx.link.href;
        }
        return {
          type      : 'photo',
          item      : $X('./ancestor::li//h2/a/text()', ctx.target)[0] || ctx.title.extract(/(.*) - 4U/i),
          itemUrl   : source || ctx.target.src,
          favorite : {
            name : '4u',
            id : source
          }
        };
      }
    },

    {
      name : 'Photo - Google',
      ICON : 'http://www.google.com/favicon.ico',
      check : function (ctx) {
        return (ctx.onLink && ctx.link.href.match('http://lh..(google.ca|ggpht.com)/.*(png|gif|jpe?g)$'));
      },
      extract : function (ctx) {
        return request(ctx.link.href, { responseType: 'document' }).then(function (res) {
          return {
            type    : 'photo',
            item    : ctx.title,
            itemUrl : $X('//img[1]', res.response)[0].src
          };
        });
      }
    },

    {
      name : 'Photo - Picasa',
      ICON : 'http://picasaweb.google.com/favicon.ico',
      check : function (ctx) {
        return (/picasaweb\.google\./).test(ctx.host) && ctx.onImage;
      },
      extract : function (ctx) {
        var item = $X('//span[@class="gphoto-context-current"]/text()', ctx.document)[0] || $X('//div[@class="lhcl_albumtitle"]/text()', ctx.document)[0] || '';
        return {
          type      : 'photo',
          item      : item.trim(),
          itemUrl   : ctx.target.src.replace(/\?.*/, ''),
          author    : $X('id("lhid_user_nickname")/text()', ctx.document)[0].trim(),
          authorUrl : $X('id("lhid_portraitlink")/@href', ctx.document)[0]
        };
      }
    },

    {
      name : 'Photo - Blogger',
      ICON : 'https://www.blogger.com/favicon.ico',
      check : function (ctx) {
        return ctx.onLink &&
          ('' + ctx.link).match(/(png|gif|jpe?g)$/i) &&
          ('' + ctx.link).match(/(blogger|blogspot)\.com\/.*\/s\d{2,}-h\//);
      },
      extract : function (ctx) {
        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : ('' + ctx.link).replace(/\/(s\d{2,})-h\//, '/$1/')
        };
      }
    },

    {
      name : 'Photo - Google Image Search',
      ICON : 'http://www.google.com/favicon.ico',
      check : function (ctx) {
        return ctx.host === 'images.google.co.jp' && ctx.onImage && ctx.onLink;
      },
      extract : function (ctx) {
        var link  = $X('parent::a/@href', ctx.target)[0];
        var itemUrl = decodeURIComponent(link.match(/imgurl=([^&]+)/)[1]);
        ctx.href = decodeURIComponent(link.match(/imgrefurl=([^&]+)/)[1]);

        return request(ctx.href).then(function (res) {
          ctx.title =
            res.responseText.extract(/<title.*?>([\s\S]*?)<\/title>/im).replace(/[\n\r]/g, '').trim() ||
            createURI(itemUrl).fileName;

          return {
            type    : 'photo',
            item    : ctx.title,
            itemUrl : itemUrl
          };
        });
      }
    },

    {
      name : 'Photo - covered',
      ICON : 'chrome://tombloo/skin/photo.png',
      check : function (ctx) {
        if (!ctx.document.elementFromPoint || !ctx.onImage) {
          return null;
        }

        // 1px四方の画像の上でクリックされたか?
        // FIXME: naturalHeight利用
        var img = $N('img', {
          src : ctx.target.src
        });
        return (img.width === 1 && img.height === 1);
      },
      extract : function (ctx) {
        return Extractors[ctx.bgImageURL ?
          'Photo - background image' :
          'Photo - area element'].extract(ctx);
      }
    },

    {
      name : 'Photo - area element',
      ICON : skin + 'photo.png',
      check: function (ctx) {
        return ctx.document.elementFromPoint && tagName(ctx.target) === 'area';
      },
      extract : function (ctx) {
        var target = ctx.target;
        return {
          type: 'photo',
          item: ctx.title,
          itemUrl: $X('//img[@usemap="#' + target.parentNode.name + '"]', ctx.document)[0].src
        };
      }
    },

    {
      name : 'Photo - image link',
      ICON : skin + 'photo.png',
      check : function (ctx) {
        if (!ctx.onLink) {
          return false;
        }

        var uri = ctx.link.href;
        return uri && (/[^\/]*\.(?:png|gif|jpe?g)$/i).test(uri);
      },
      extract : function (ctx) {
        ctx.target = ctx.link;

        return Extractors.Photo.extract(ctx);
      }
    },

    {
      name : 'Photo',
      ICON : skin + 'photo.png',
      PROTECTED_SITES : [
        'image\\.itmedia\\.co.jp/',
        'wretch\\.yimg\\.com/',
        'pics.*\\.blog\\.yam\\.com/',
        '/www\\.imgscan\\.com/image_c\\.php',
        'keep4u\\.ru/imgs/',
        '/www\\.toofly\\.com/userGallery/',
        '/www\\.dru.pl/',
        'adugle\\.com/shareimagebig/',
        '/awkwardfamilyphotos\\.com/',
        'share-image\\.com/pictures/big/'
      ],
      check : function (ctx) {
        return ctx.onImage;
      },
      extract : function (ctx) {
        var target = ctx.target;
        var tag = tagName(target);
        var source =
          tag === 'object' ? target.data :
          tag === 'img' ? target.src : target.href;

        /*
        if(this.PROTECTED_SITES.some(function(re){
          return RegExp(re).test(source);
        })){
          return Tombloo.Service.extractors['Photo - Upload from Cache'].extract(ctx);
        };
        */

        // FIXME
        var m = ctx.title.match(/([^\/\s]+) \(\d+×\d+\)$/);
        if (m) {
          ctx.title = m[1];
        }

        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : source
        };
      }
    },

    {
      name: 'Photo - Upload from Cache',  // not cache... sorry
      ICON: skin + 'photo.png',
      check: function (ctx) {
        return ctx.onImage;
      },
      extract: function (ctx) {
        var contentType = ctx.document.contentType;
        if (contentType && contentType.match(/^image/)) {
          ctx.title = ctx.href.split('/').pop();
        }
        var target = ctx.target;
        var itemUrl = (tagName(target) === 'object') ? target.data : target.src;
        return downloadFile(itemUrl, {
          ext  : getFileExtension(itemUrl)
        }).then(function (url) {
          return {
            type: 'photo',
            item: ctx.title,
            itemUrl: itemUrl,
            fileEntry: url
          };
        });
      }
    },

    {
      name : 'Video - Vimeo',
      ICON : 'http://vimeo.com/favicon.ico',
      check : function (ctx) {
        return ctx.host.match(/vimeo\.com/);
      },
      extract : function (ctx) {
        var author = $X('//div[@class="byline"]/a', ctx.document)[0];
        return {
          type      : 'video',
          item      : $X('//meta[@property="og:title"]/@content', ctx.document)[0],
          itemUrl   : ctx.href,
          author    : author.textContent,
          authorUrl : author.href
        };
      }
    },

    {
      name : 'Video - YouTube',
      ICON : 'http://youtube.com/favicon.ico',
      check : function (ctx) {
        if (ctx.href.match(/^https?:\/\/.*\.youtube\.com\/watch\.*/)) {
          return queryHash(createURI(ctx.href).search).v;
        }
        return false;
      },
      extract : function (ctx) {
        // not use @rel="author"
        // because official channel use banner image, can't get author text information by textContent.
        var author_anchor = ctx.document.querySelector('#watch7-user-header .yt-user-name');

        ctx.title = ctx.title.replace(/[\n\r\t]+/gm, ' ').trim();

        var ps = {
          type      : 'video',
          item      : $X('id("watch7-content")/meta[@itemprop="name"]/@content')[0],
          itemUrl   : $X('id("watch7-content")/link[@itemprop="url"]/@href')[0],
          author    : author_anchor.textContent.trim(),
          authorUrl : author_anchor.href.split('?')[0]
        };

        var canonical = $X('//link[@rel="canonical"]')[0];
        if (canonical) {
          canonical.parentNode.removeChild(canonical);
        }

        return ps;
      }
    },

    {
      name : 'Video - Google Video',
      ICON : 'http://www.google.com/favicon.ico',
      check : function (ctx) {
        return ctx.host.match(/video\.google\.com/);
      },
      extract : function (ctx) {
        return {
          type    : 'video',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : $X('id("embed-video")/textarea/text()', ctx.document)[0]
        };
      }
    },

    {
      name : 'Video - MySpaceTV',
      ICON : 'http://vids.myspace.com/favicon.ico',
      check : function (ctx) {
        return ctx.host.match(/vids\.myspace\.com/) && this.getTag(ctx);
      },
      extract : function (ctx) {
        var tag = this.getTag(ctx);
        ctx.href = tag.extract(/href="(.+?)"/);

        return {
          type    : 'video',
          item    : tag.extract(/<a.+?>(.+?)<\/a>/),
          itemUrl : ctx.href,
          body    : tag.extract(/(<object.+object>)/)
        };
      },
      getTag : function (ctx) {
        return $X('id("tv_embedcode_embed_text")/@value', ctx.document)[0];
      }
    },

    {
      name : 'Video - Dailymotion',
      ICON : 'http://www.dailymotion.com/favicon.ico',
      check : function (ctx) {
        return ctx.host.match(/dailymotion\.com/) && this.getPlayer(ctx);
      },
      extract : function (ctx) {
        var player = this.getPlayer(ctx);
        var width  = $X('//meta[@name="twitter:player:width"]/@content', ctx.document)[0];
        var height = $X('//meta[@name="twitter:player:height"]/@content', ctx.document)[0];

        ctx.title = $X('//meta[@property="og:title"]/@content', ctx.document)[0];
        ctx.href  = $X('//meta[@property="og:url"]/@content', ctx.document)[0];

        return {
          type    : 'video',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : '<iframe frameborder="0" width="' + width + '" height="' + height + '" src="' + player + '"></iframe>'
        };
      },
      getPlayer : function (ctx) {
        return $X('//meta[@name="twitter:player"]/@value', ctx.document)[0];
      }
    },

    {
      name : 'Video - Nico Nico Douga',
      ICON : 'http://www.nicovideo.jp/favicon.ico',
      check : function (ctx) {
        return ctx.href.match(/^http:\/\/www\.nicovideo\.jp\/watch\//);
      },
      extract : function (ctx) {
        var externalPlayerURL = 'http://ext.nicovideo.jp/thumb_' + ctx.pathname.slice(1) + '?thumb_mode=swf&ap=1&c=1';

        return {
          type    : 'video',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : '<embed type="application/x-shockwave-flash" width="485" height="385" src="' + externalPlayerURL + '">',
          data    : (function (doc) {
            var thumbnail, description;

            var image = doc.querySelector('.videoThumbnailImage, .img_std128, [itemprop="image"]');
            if (image) {
              thumbnail = image.src || image.content;
            } else {
              var script = doc.querySelector('#WATCHHEADER ~ script');
              thumbnail = script && script.textContent.extract(/thumbnail:\s+'(.+)'/, 1).replace(/\\/g, '');
            }

            var desc = doc.querySelector('.videoDescription, [itemprop="description"], #itab_description');
            description = desc && desc.textContent.trim();

            return thumbnail && description && {thumbnail: thumbnail, description: description};
          }(ctx.document))
        };
      }
    },

    {
      name : 'Audio',
      ICON : skin + 'audio.png',
      check: function (ctx) {
        return (tagName(ctx.target) === 'audio') && ctx.target.src;
      },
      extract: function (ctx) {
        var src = ctx.target.src;
        var ext = '';
        var m = src.match(/([^\/\s]+)$/);
        if (m) {
          ctx.title = m[1];
        }
        m = src.match(/[^\/\s\.]*(\.[^\/\s\.])$/);
        if (m) {
          ext = m[1];
        }
        return {
          type   : 'audio',
          itemUrl: src,
          suffix : ext,
          item   : ctx.title
        };
      }
    },

    {
      name : 'Quote',
      ICON : skin + 'quote.png',
      check : function (ctx) {
        return ctx.selection;
      },
      extract : function (ctx) {
        return {
          type    : 'quote',
          item    : ctx.title,
          itemUrl : ctx.href,
          body    : ctx.selection.raw,
          flavors : {
            html    : ctx.selection.html
          }
        };
      }
    },

    {
      name : 'Link - link',
      ICON : skin + 'link.png',
      check: function (ctx) {
        return ctx.onLink;
      },
      extract: function (ctx) {
        var title = ctx.target.textContent;
        if (!title || title === ctx.target.href) {
          title = ctx.title;
        }

        return {
          type: 'link',
          item: title,
          itemUrl: ctx.link.href
        };
      }
    },

    {
      name : 'Link',
      ICON : skin + 'link.png',
      check : function () {
        return true;
      },
      extract : function (ctx) {
        return {
          type    : 'link',
          item    : ctx.title,
          itemUrl : ctx.href
        };
      }
    },

    {
      name : 'Photo - background image',
      ICON : skin + 'photo.png',
      check : function (ctx) {
        if (ctx.target && ctx.document) {
          var bg = Extractors['Photo - background image'].lookupBG(ctx.target, ctx.document);
          if (bg) {
            var m = bg.match(/url\s*\(\s*['"]?\s*(https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+)\s*['"]?\s*\)/);
            if (m) {
              ctx.bgImageURL = m[1];
            }
          }
        }
        return ctx.bgImageURL;
      },
      lookupBG: function (elm, doc) {
        if (elm !== doc) {
          return (function callee(target) {
            var bg = getComputedStyle(target, '').backgroundImage;
            if ((bg !== 'none') && bg) {
              return bg;
            } else {
              var parent = target.parentNode;
              if (parent === doc || !parent) {
                return null;
              } else {
                return callee(parent);
              }
            }
          })(elm);
        } else {
          return null;
        }
      },
      extract : function (ctx) {
        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : ctx.bgImageURL
        };
      }
    },

    {
      // Region Capture のみ対応
      name : 'Photo - Capture',
      ICON : skin + 'photo.png',
      TARGET_BACKGROUND: '#888',
      check : function () {
        return true;
      },
      extract : function (ctx) {
        var self = this;
        // ショートカットキーからポストするためcaptureTypeを追加
        // var type = ctx.captureType || input({'Capture Type' : ['Region', 'Element', 'View', 'Page']});
        var type = ctx.captureType || 'Region';
        if (!type) {
          return null;
        }

        var win = ctx.window;

        return defer().then(function () {
          switch (type) {
          case 'Region':
            return self.selectRegion(ctx).then(function (region) {
              return self.capture(win, region.position, region.dimensions);
            });

          case 'Element':
            return self.selectElement(ctx).then(function (elm) {
              var rect = elm.getBoundingClientRect();
              return self.capture(win, {
                x: Math.round(rect.left),
                y: Math.round(rect.top)
              }, getElementDimensions(elm));
            });

          case 'View':
            return self.capture(win, { x: 0, y: 0 }, getViewportDimensions());

          case 'Page':
            return self.capture(win, { x: 0, y: 0 }, getPageDimensions());
          }
          return null;
        }).then(function (file) {
          return {
            type: 'photo',
            item: ctx.title,
            fileEntry: file
          };
        });
      },
      capture: function (win, pos, dim, scale) {
        // Google Chrome doesn't support CanvasRenderingContext2D#drawWindow
        return new Promise(function (resolve) {
          var width = win.innerWidth;
          chrome.runtime.sendMessage(TBRL.id, {
            request: 'capture'
          }, function (res) {
            var img = document.createElement('img');
            img.addEventListener('load', function callee() {
              img.removeEventListener('load', callee, false);
              scale = (img.naturalWidth === width) ? null : img.naturalWidth / width;
              var canvas = document.createElement('canvas');
              var size = {w: 0, h: 0};
              var ctx = canvas.getContext('2d');
              if (scale) {
                scale  = scale.w ? (scale.w / dim.w) : scale.h ? (scale.h / dim.h) : scale;
                canvas.width  = size.w = dim.w;
                canvas.height = size.h = dim.h;
                dim.w *= scale;
                dim.h *= scale;
                pos.x *= scale;
                pos.y *= scale;
              } else {
                canvas.width  = size.w = dim.w;
                canvas.height = size.h = dim.h;
              }
              ctx.drawImage(img, pos.x, pos.y, dim.w, dim.h, 0, 0, size.w, size.h);
              base64ToFileEntry(canvas.toDataURL('image/png', '')).then(resolve);
            }, false);
            img.src = res;
          });
        });
      },
      selectElement: function (ctx) {
        var self = this;
        return new Promise(function (resolve, reject) {
          var doc = ctx ? ctx.document : document;

          var target;
          function onMouseOver(e) {
            target = e.target;
            target.originalBackground = target.style.background;
            target.style.background = self.TARGET_BACKGROUND;
          }
          function onMouseOut(e) {
            unpoint(e.target);
          }
          function onClick(e) {
            cancel(e);

            finalize();
            resolve(target);
          }
          function onKeyDown(e) {
            cancel(e);

            switch (keyString(e)) {
            case 'ESCAPE':
              finalize();
              reject();
              return;
            }
          }
          function unpoint(elm) {
            if (elm.originalBackground != null) {
              elm.style.background = elm.originalBackground;
              elm.originalBackground = null;
            }
          }
          function finalize() {
            doc.removeEventListener('mouseover', onMouseOver, true);
            doc.removeEventListener('mouseout', onMouseOut, true);
            doc.removeEventListener('click', onClick, true);
            doc.removeEventListener('keydown', onKeyDown, true);
            doc.removeEventListener('contextmenu', onClick, true);

            unpoint(target);
          }

          doc.addEventListener('mouseover', onMouseOver, true);
          doc.addEventListener('mouseout', onMouseOut, true);
          doc.addEventListener('click', onClick, true);
          doc.addEventListener('keydown', onKeyDown, true);
          doc.addEventListener('contextmenu', onClick, true);
        });
      },
      selectRegion: function (ctx) {
        return new Promise(function (resolve, reject) {
          var doc = ctx ? ctx.document : document;

          var win = doc.defaultView;

          doc.documentElement.style.cursor = 'crosshair';

          var style = doc.createElement('style');
          style.innerHTML =
            '* {\n' +
            '  cursor: crosshair !important;\n' +
            '  -webkit-user-select: none;\n' +
            '  user-select: none;\n' +
            '}\n' +
            'div.taberareloo_capture_size {\n' +
            '  padding: 5px !important;\n' +
            '  border-radius: 5px !important;\n' +
            '  opacity: 0.7 !important;\n' +
            '  position: fixed !important;\n' +
            '  z-index: 999999999 !important;\n' +
            '  background-color: gray !important;\n' +
            '  color: white !important;\n' +
            '}\n';
          doc.body.appendChild(style);

          var region, p, d, moving, square, size;
          function mouse(e) {
            return {
              x: e.clientX,
              y: e.clientY
            };
          }

          function onMouseMove(e) {
            var to = mouse(e);

            if (moving) {
              var px = to.x - d.w, py = to.y - d.h;
              if (px > window.innerWidth) {
                px = window.innerWidth;
              }

              if (py > window.innerHeight) {
                py = window.innerHeight;
              }

              p.x = Math.max(px, 0);
              p.y = Math.max(py, 0);
            }

            d = {
              w: to.x - p.x,
              h: to.y - p.y
            };

            var minusW = (d.w < 0), minusH = (d.h < 0);

            var s;
            if (square) {
              s = Math.min(Math.abs(d.w), Math.abs(d.h));
              d.w = (minusW) ? -(s) : s;
              d.h = (minusH) ? -(s) : s;

            }
            var d2 = update({}, d), p2 = update({}, p);

            if (minusW || minusH) {
              // 反転モード
              if (d2.w < 0) {
                p2.x = p.x + d2.w;
                d2.w = -d2.w;
                if (p2.x < 0) {
                  d2.w += p2.x;
                  p2.x = 0;
                }
              }
              if (d2.h < 0) {
                p2.y = p.y + d2.h;
                d2.h = -d2.h;
                if (p2.y < 0) {
                  d2.h += p2.y;
                  p2.y = 0;
                }
              }
              d.w = (minusW) ? -(d2.w) : d2.w;
              d.h = (minusH) ? -(d2.h) : d2.h;
            }

            var rx = p2.x + d2.w;
            if (rx > window.innerWidth) {
              rx = (rx - window.innerWidth);
              d.w -= rx;
              d2.w -= rx;
            }
            var ry = p2.y + d2.h;
            if (ry > window.innerHeight) {
              ry = (ry - window.innerHeight);
              d.h -= ry;
              d2.h -= ry;
            }

            if (square) {
              if (d2.w < d2.h) {
                s = d2.w;
                if (minusH) {
                  p2.y += d2.h - s;
                  d.h = -(s);
                } else {
                  d.h = s;
                }
                d2.h  = s;
              } else {
                s = d2.h;
                if (minusW) {
                  p2.x += d2.w - s;
                  d.w = -(s);
                } else {
                  d.w = s;
                }
                d2.w  = s;
              }
            }

            // position
            region.style.top = p2.y + 'px';
            region.style.left = p2.x + 'px';

            // dimention
            region.style.width = d2.w + 'px';
            region.style.height = d2.h + 'px';

            $D(size);
            size.appendChild($T(d2.w + ' × ' + d2.h));
            // Sketch Switch
            // size.appendChild($T('× / _ / ×'));

            setStyle(size, {
              'top'  : to.y + 10 + 'px',
              'left' : to.x + 10 + 'px'
            });
          }

          function onMouseDown(e) {
            cancel(e);

            p = mouse(e);
            region = doc.createElement('div');
            setStyle(region, {
              'background': '#888',
              'opacity'   : '0.5',
              'position'  : 'fixed',
              'zIndex'    : '999999999',
              'top'       : p.y + 'px',
              'left'      : p.x + 'px'
            });
            doc.body.appendChild(region);
            size = $N('div', {
              'class' : 'taberareloo_capture_size'
            });
            doc.body.appendChild(size);

            doc.addEventListener('mousemove', onMouseMove, true);
            doc.addEventListener('mouseup', onMouseUp, true);
            win.addEventListener('keydown', onKeyDown, true);
            win.addEventListener('keyup', onKeyUp, true);
          }

          function onKeyDown(e) {
            cancel(e);

            switch (keyString(e)) {
            case 'SHIFT':
              square = true;
              return;
            case 'SPACE':
              moving = true;
              return;
            case 'ESCAPE':
              finalize();
              reject();
              return;
            }
          }

          function onKeyUp(e) {
            cancel(e);

            switch (keyString(e)) {
            case 'SHIFT':
              square = false;
              return;
            case 'SPACE':
              moving = false;
              return;
            }
          }

          function onMouseUp(e) {
            cancel(e);

            var rect = region.getBoundingClientRect();
            p = { x: Math.round(rect.left), y: Math.round(rect.top) };
            finalize();

            // FIXME: 暫定/左上方向への選択不可/クリックとのダブルインターフェース未実装
            if (!d) {
              reject();
              return;
            }
            d.w = Math.abs(d.w);
            d.h = Math.abs(d.h);

            resolve({
              position: p,
              dimensions: d
            });
          }

          function onClick(e) {
            // リンククリックによる遷移を抑止する
            cancel(e);

            // mouseupよりも後にイベントが発生するため、ここで取り除く
            doc.removeEventListener('click', onClick, true);
          }

          function finalize() {
            doc.removeEventListener('mousedown', onMouseDown, true);
            doc.removeEventListener('mousemove', onMouseMove, true);
            doc.removeEventListener('mouseup', onMouseUp, true);
            win.removeEventListener('keydown', onKeyDown, true);
            win.removeEventListener('keyup', onKeyUp, true);

            doc.documentElement.style.cursor = '';

            region.parentNode.removeChild(region);
            size.parentNode.removeChild(size);
            style.parentNode.removeChild(style);
          }

          doc.addEventListener('mousedown', onMouseDown, true);
          doc.addEventListener('click', onClick, true);
          doc.defaultView.focus();
        });
      }
    },

    {
      name : 'Text',
      ICON : skin + 'text.png',
      check : function () {
        return true;
      },
      extract : function () {
        return {
          type : 'regular'
        };
      }
    }
  ]);
}(this));
/* vim: set sw=2 ts=2 et tw=80 : */
