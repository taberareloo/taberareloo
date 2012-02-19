// -*- coding: utf-8 -*-

var Models = new Repository();

var Tumblr = {
  name : 'Tumblr',
  ICON : 'http://www.tumblr.com/images/favicon.gif',
  MEDIA_URL : 'http://media.tumblr.com/',
  TUMBLR_URL : 'http://www.tumblr.com/',
  LINK : 'http://www.tumblr.com/',
  LOGIN_URL : 'http://www.tumblr.com/login',

  /**
   * ポストを削除する。
   *
   * @param {Number || String} id ポストID。
   * @return {Deferred}
   */
  remove : function(id){
    var self = this;
    return this.getToken().addCallback(function(token){
      return request(Tumblr.TUMBLR_URL+'delete', {
        //denyRedirection: true,
        referrer    : Tumblr.TUMBLR_URL,
        sendContent : {
          id          : id,
          form_key    : token,
          redirect_to : 'dashboard'
        }
      });
    });
  },

  /**
   * reblog情報を取り除く。
   *
   * @param {Array} form reblogフォーム。
   * @return {Deferred}
   */
  trimReblogInfo : function(form){
    if(!TBRL.Config['entry']['trim_reblog_info'])
     return null;

    function trimQuote(entry){
      entry = entry.replace(/<p><\/p>/g, '').replace(/<p><a[^<]+<\/a>:<\/p>/g, '');
      entry = (function(all, contents){
        return contents.replace(/<blockquote>(([\n\r]|.)+)<\/blockquote>/gm, arguments.callee);
      })(null, entry);
      return entry.trim();
    }

    switch(form['post[type]']){
    case 'link':
      form['post[three]'] = trimQuote(form['post[three]']);
      break;
    case 'regular':
    case 'photo':
    case 'video':
      form['post[two]'] = trimQuote(form['post[two]']);
      break;
    case 'quote':
      form['post[two]'] = form['post[two]'].replace(/ \(via <a.*?<\/a>\)/g, '').trim();
      break;
    }

    return form;
  },

  /**
   * ポスト可能かをチェックする。
   *
   * @param {Object} ps
   * @return {Boolean}
   */
  check : function(ps){
    return /regular|photo|quote|link|conversation|video|audio/.test(ps.type) && ((ps.type !== 'audio') || ps.suffix === '.mp3');
  },

  /**
   * 新規エントリーをポストする。
   *
   * @param {Object} ps
   * @return {Deferred}
   */
  post : function(ps){
    var self = this;
    if(TBRL.Config.post['tumblr_default_quote']){
      ps = update({}, ps);
      ps.flavors = update({}, ps.flavors);
      delete ps['flavors']['html'];
    }
    var endpoint = Tumblr.TUMBLR_URL + 'new/' + ps.type;
    return this.postForm(function(){
      return self.getForm(endpoint).addCallback(function(form){
        if (Tumblr[ps.type.capitalize()].convertToFormAsync) {
          // convertToFormが非同期な場合
          ret = new Deferred();
          Tumblr[ps.type.capitalize()].convertToFormAsync(ps).addCallback(function(form2){
            update(form, form2);
            self.appendTags(form, ps);
            request(endpoint, {sendContent : form}).addCallback(function(res){
              ret.callback(res);
            }).addErrback(function(err){
              ret.errback(err);
            });
          });
          return ret;
        } else {
          update(form, Tumblr[ps.type.capitalize()].convertToForm(ps));

          self.appendTags(form, ps);

          return request(endpoint, {sendContent : form});
        }
      });
    });
  },

  /**
   * ポストフォームを取得する。
   * reblogおよび新規エントリーのどちらでも利用できる。
   *
   * @param {Object} url フォームURL。
   * @return {Deferred}
   */
  getForm : function(url){
    var self = this;
    return request(url).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("account_form")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      var form = formContents($X('id("edit_post")', doc)[0]);
      delete form.preview_post;
      form.redirect_to = Tumblr.TUMBLR_URL+'dashboard';

      if(form.reblog_post_id){
        self.trimReblogInfo(form);

        // Tumblrから他サービスへポストするため画像URLを取得しておく
        if(form['post[type]']==='photo')
          form.image = $X('id("edit_post")//img[contains(@src, "media.tumblr.com/") or contains(@src, "data.tumblr.com/")]/@src', doc)[0];
      }

      return form;
    });
  },

  /**
   * フォームへタグとプライベートを追加する。
   *
   * @param {Object} url フォームURL。
   * @return {Deferred}
   */
  appendTags : function(form, ps){
    form['post[state]'] = (ps.private) ? 'private' : 0;
    if (TBRL.Config.post['post_with_queue']) {
      if (ps.type !== 'regular') {
        form['post[state]'] = 2;
      }
    }

    if (TBRL.Config['entry']['append_content_source']) {
      if (!(ps.favorite) ||
          !(ps.favorite.name) ||
          ps.favorite.name !== 'Tumblr') {
        // not reblog post
        if (ps.pageUrl && ps.pageUrl !== 'http://') {
          form['post[source_url]'] = ps.pageUrl;
          if (ps.type !== 'link') {
            form['post[three]'] = ps.pageUrl;
          }
        }
      }
    }

    return update(form, {
      'post[tags]' : (ps.tags && ps.tags.length)? joinText(ps.tags, ',') : ''
    });
  },

  /**
   * reblogする。
   * Tombloo.Service.extractors.ReBlogの各抽出メソッドを使いreblog情報を抽出できる。
   *
   * @param {Object} ps
   * @return {Deferred}
   */
  favor : function(ps){
    // メモをreblogフォームの適切なフィールドの末尾に追加する
    var form = ps.favorite.form;
    var that = this;
    if (Tumblr[ps.type.capitalize()].convertToFormAsync) {
      return Tumblr[ps.type.capitalize()].convertToFormAsync({
        description : ps.description
      }).addCallback(function(res) {
        items(res).forEach(function(item) {
          var name = item[0], value = item[1];
          if (!value) {
            return;
          }
          form[name] += '\n\n' + value;
        });
        that.appendTags(form, ps);
        return that.postForm(function(){
          return request(ps.favorite.endpoint, {sendContent : form});
        });
      });
    } else {
      items(Tumblr[ps.type.capitalize()].convertToForm({
        description : ps.description
      })).forEach(function(item) {
        var name = item[0], value = item[1];
        if (!value) {
          return;
        }
        if (name === "itemUrl" &&
            value.indexOf('http://') !== 0) {
          return;
        }
        form[name] += '\n\n' + value;
      });

      this.appendTags(form, ps);

      return this.postForm(function(){
        return request(ps.favorite.endpoint, {sendContent : form});
      });
    }
  },

  /**
   * フォームをポストする。
   * 新規エントリーとreblogのエラー処理をまとめる。
   *
   * @param {Function} fn
   * @return {Deferred}
   */
  postForm : function(fn){
    var self = this;
    return succeed().addCallback(fn).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("account_form")', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      } else if($X('id("posts")', doc)[0]){
        return null;
      } else {
        if(res.responseText.match('more tomorrow')) {
          throw new Error('You\'ve exceeded your daily post limit.');
        } else {
          var doc = createHTML(res.responseText);
          throw new Error(doc.getElementById('errors').textContent.trim());
        }
      }
    });
  },

  /**
   * ポストや削除に使われるトークン(form_key)を取得する。
   * 結果はキャッシュされ、再ログインまで再取得は行われない。
   *
   * @return {Deferred} トークン(form_key)が返される。
   */
  getToken : function(){
    var self = this;
    return request(Tumblr.TUMBLR_URL+'new/text').addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("account_form")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      return self.token = $X('id("form_key")/@value', doc)[0];
    });
  },

  getTumblelogs : function(){
    var self = this;
    return request(Tumblr.TUMBLR_URL+'new/text').addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("account_form")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      return $X('id("channel_id")//option[@value!=0]', doc).map(function(opt){
        return {
          id : opt.value,
          name: opt.textContent
        };
      });
    });
  }
};


Tumblr.Regular = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : ps.item,
      'post[two]'  : joinText([getFlavor(ps, 'html'), ps.description], '\n\n')
    };
  }
};

Tumblr.Photo = {
  convertToFormAsync : function(ps){
    // Tumblrのバグで画像がリダイレクトすると投稿できないので，予めリダイレクト先を調べておく
    var ret = new Deferred();
    function callback(res) {
      var finalurl = res.responseText;

      var form = {
        'post[type]'  : ps.type,
        't'           : ps.item,
        'u'           : ps.pageUrl,
        'post[two]'   : joinText([
          (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
          ps.description], '\n\n'),
        'post[three]' : ps.pageUrl
      };
      ps.file ? (form['images[o1]'] = ps.file) : (form['photo_src'] = finalurl);
      ret.callback(form);
    }
    if (ps.itemUrl) {
      request('http://finalurl.appspot.com/api', {
        queryString: {
          url: ps.itemUrl
        },
        method: 'GET'
      }).addCallback(callback);
    } else {
      setTimeout(callback, 0, {});
    }
    return ret;
  }
};

Tumblr.Video = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : getFlavor(ps, 'html') || ps.itemUrl,
      'post[two]'  : joinText([
        (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
        ps.description], '\n\n')
    };
  }
};

Tumblr.Link = {
  convertToForm : function(ps){
    if(ps.pageUrl){
      var thumb = TBRL.Config['entry']['thumbnail_template'].replace(RegExp('{url}', 'g'), ps.pageUrl);
    } else {
      var thumb = '';
    }
    return {
      'post[type]'  : ps.type,
      'post[one]'   : ps.item,
      'post[two]'   : ps.itemUrl,
      'post[three]' : joinText([thumb, getFlavor(ps, 'html'), ps.description], '\n\n')
    };
  }
};

Tumblr.Conversation = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : ps.item,
      'post[two]'  : joinText([getFlavor(ps, 'html'), ps.description], '\n\n')
    };
  }
};

Tumblr.Quote = {
  convertToForm : function(ps){
    return {
      'post[type]' : ps.type,
      'post[one]'  : getFlavor(ps, 'html'),
      'post[two]'  : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n')
    };
  }
};

Tumblr.Audio = {
  convertToForm : function(ps){
    var res = {
      'post[type]'  : ps.type,
      'post[two]'   : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n')
    };
    if(ps.itemUrl)
      res['post[three]'] = ps.itemUrl;
    return res;
  }
};

Models.register(Tumblr);

Models.register({
  name : '4u',
  ICON : chrome.extension.getURL('skin/4u.ico'),
  LOGIN_URL : 'http://4u.straightline.jp/admin/login',

  LINK : 'http://4u.straightline.jp/',

  check : function(ps){
    return ps.type === 'photo' && !ps.file;
  },

  post : function(ps){
    var self = this;
    return request(this.LINK + 'power/manage/register', {
      referrer : ps.pageUrl,
      queryString : {
        site_title  : ps.page,
        site_url    : ps.pageUrl,
        alt         : ps.item,
        src         : ps.itemUrl,
        bookmarklet : 1
      }
    }).addCallback(function(res){
      if(/login/.test(res.responseText)){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
  },

  favor : function(ps){
    return this.iLoveHer(ps.favorite.id);
  },

  iLoveHer : function(id){
    var self = this;
    return request(this.LINK + 'user/manage/do_register', {
      redirectionLimit : 0,
      referrer : this.LINK,
      queryString : {
        src : id
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('//form[@action="http://4u.straightline.jp/admin/login"]', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
  }
});

Models.register({
  name : 'FFFFOUND',
  ICON : 'http://ffffound.com/favicon.ico',
  URL  : 'http://FFFFOUND.com/',

  getToken : function(){
    return request(this.URL + 'bookmarklet.js').addCallback(function(res){
      return res.responseText.match(/token ?= ?'(.*?)'/)[1];
    });
  },

  check : function(ps){
    return ps.type === 'photo' && !ps.file;
  },

  post : function(ps){
    var self = this;
    return this.getToken().addCallback(function(token){
      return request(self.URL + 'add_asset', {
        referrer : ps.pageUrl,
        queryString : {
          token   : token,
          url     : ps.itemUrl,
          referer : ps.pageUrl,
          title   : ps.item,
        },
      }).addCallback(function(res){
        if(res.responseText.match('(FAILED:|ERROR:) +(.*?)</span>'))
          throw new Error(RegExp.$2.trim());

        if(res.responseText.match('login'))
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      });
    });
  },

  favor : function(ps){
    return this.iLoveThis(ps.favorite.id)
  },

  remove : function(id){
    return request(this.URL + 'gateway/in/api/remove_asset', {
      referrer : this.URL,
      sendContent : {
        collection_id : id,
      },
    });
  },

  iLoveThis : function(id){
    var self = this;
    return request(this.URL + 'gateway/in/api/add_asset', {
      referrer : this.URL,
      sendContent : {
        collection_id : 'i'+id,
        inappropriate : false,
      },
    }).addCallback(function(res){
      var error = res.responseText.extract(/"error":"(.*?)"/);
      if(error === 'AUTH_FAILED')
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      // NOT_FOUND / EXISTS / TOO_BIG
      if(error)
        throw new Error(RegExp.$1.trim());
    });
  },
});

Models.register({
  name : 'Local',
  ICON : chrome.extension.getURL('skin/local.ico'),

  check : function(ps) {
    return ps.type === 'photo';
  },

  post : function(ps) {
    var self = this;
    return this.getDataURL(ps).addCallback(function(url) {
      return self.Photo.post(ps, url);
    });
  },

  append : function(file, ps) {
    putContents(file, joinText([
      joinText([joinText(ps.tags, ' '), ps.item, ps.itemUrl, ps.body, ps.description], '\n\n', true),
      getContents(file)
    ], '\n\n\n'));

    return succeed();
  },

  getDataURL : function(ps) {
    var self = this;
    return (
      ps.file
        ? fileToDataURL(ps.file).addCallback(function(url) {
          return url;
        })
        : succeed(ps.itemUrl)
    );
  },

  Photo : {
    post : function(ps, url) {
      if (!/^(http|data)/.test(url)) {
        return fail('ps.itemUrl is not URL');
      }

      // from newer version, background page can download images
      // so we restrict chrome version in manifest.json
      var ev = document.createEvent('MouseEvents');
      ev.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, true, false, false, 0, null);
      var target = $N('a', { href: url }, $N('img', {src: url}));
      target.dispatchEvent(ev);
      return succeed();
    }
  }
});

Models.register({
  name : 'Hatena',
  ICON : 'http://www.hatena.ne.jp/favicon.ico',
  JSON : 'http://b.hatena.ne.jp/my.name',

  getToken : function(){
    if(this.data){
      return succeed(this.data);
    } else {
      var self = this;
      return request(Hatena.JSON).addCallback(function(res){
        var data = JSON.parse(res.responseText);
        if(!data["login"]){
          delete self['data'];
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        self.data  = data;
        return self.data;
      });
    }
  },

  reprTags: function (tags) {
    return tags ? tags.map(function(t){
      return '[' + t + ']';
    }).join('') : '' ;
  }
});

// FIXME
// thx id: secondlife & Hatena.inc
Models.register({
  name : 'HatenaFotolife',
  ICON : 'http://f.hatena.ne.jp/favicon.ico',
  LINK : 'http://f.hatena.ne.jp/',
  LOGIN_URL : 'https://www.hatena.ne.jp/login',

  check : function(ps){
    return ps.type === 'photo';
  },

  getToken : function(){
    var self = this;
    return Hatena.getToken().addErrback(function(e){
      throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
    });
  },

  post : function(ps){
    var that = this;
    return (ps.file ? succeed(ps.file) : download(ps.itemUrl).addCallback(function(entry) {
      return getFileFromEntry(entry);
    })).addCallback(function(file) {
      return fileToPNGDataURL(file).addCallback(function(container) {
        return that.uploadWithBase64(container);
      });
      // TODO(Constellation) extension guess
//      return that.upload({
//        fototitle1: ps.item || ps.page,
//        image1: file
//      });
    });
  },

  // image1 - image5
  // fototitle1 - fototitle5 (optional)
  upload : function(ps){
    return this.getToken().addCallback(function(set){
      ps.rkm = set['rkm'];
      return request('http://f.hatena.ne.jp/'+set['name']+'/up', {
        sendContent : update({
          mode : 'enter'
        }, ps)
      });
    });
  },

  uploadWithBase64 : function(file){
    var self = this;
    return this.getToken().addCallback(function(set){
      var name = set['name'];
      var rkm  = set['rkm'];
      return request('http://f.hatena.ne.jp/'+name+'/haiku', {
        method: 'POST',
        sendContent: {
          name : name,
          rkm  : rkm,
          ext  : 'png',
          model: 'capture',
          image: cutBase64Header(file.binary),
          fotosize: Math.max(file.height, file.width),
          folder  : ''
      }
      });
    });
  }
});

Models.register({
  name : 'HatenaBookmark',
  ICON : 'http://b.hatena.ne.jp/favicon.ico',
  LINK : 'http://b.hatena.ne.jp/',
  LOGIN_URL : 'https://www.hatena.ne.jp/login',

  POST_URL : 'http://b.hatena.ne.jp/add',
  JSON_URL : 'http://b.hatena.ne.jp/my.name',

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    // タイトルは共有されているため送信しない
    return this.addBookmark(ps.itemUrl, null, ps.tags, joinText([ps.body, ps.description], ' ', true));
  },

  getToken : function(){
    var self = this;
    return Hatena.getToken().addErrback(function(e){
      delete self['tags'];
      throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
    });
  },

  addBookmark : function(url, title, tags, description){
    return this.getToken().addCallback(function(data){
      return request('http://b.hatena.ne.jp/bookmarklet.edit', {
        //denyRedirection: true,
        method: 'POST',
        sendContent : {
          rks     : data['rks'],
          url     : url.replace(/%[0-9a-f]{2}/g, function(s){
            return s.toUpperCase();
          }),
          title   : title,
          comment : Models.Hatena.reprTags(tags) + description.replace(/[\n\r]+/g, ' ')
        }
      });
    });
  },

  /**
   * タグ、おすすめタグ、キーワードを取得する
   * ページURLが空の場合、タグだけが返される。
   *
   * @param {String} url 関連情報を取得する対象のページURL。
   * @return {Object}
   */
  getSuggestions : function(url){
    var that = this;
    return this.getToken().addCallback(function(set){
      return DeferredHash({
        tags: that.getUserTags(set['name']),
        data: that.getURLData(url)
      });
    }).addCallback(function(resses){
      if(!resses['tags'][0] || !resses['data'][0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
      var data = resses['data'][1];
      return {
        duplicated : !!data['bookmarked_data'],
        recommended : data['recommend_tags'],
        tags : resses['tags'][1]
      }
    });
  },

  getUserTags: function(user){
    var that = this;
    var tags = that.tags;
    if (tags) {
      return succeed(tags);
    } else {
      return request('http://b.hatena.ne.jp/'+user+'/tags.json').addCallback(function(res){
        try{
          tags = JSON.parse(res.responseText)['tags'];
        } catch(e) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        return that.tags = items(tags).map(function(pair){
          return {
            name      : pair[0],
            frequency : pair[1].count
          }
        });
      });
    }
  },

  getURLData: function(url){
    var that = this;
    return request('http://b.hatena.ne.jp/my.entry', {
      queryString : {
        url  : url
      }
    }).addCallback(function(res){
      try{
        var json = JSON.parse(res.responseText);
      } catch(e) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
      return json;
    });
  }
});

Models.register({
  name : 'Pinboard',
  ICON : 'http://pinboard.in/favicon.ico',

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  getCurrentUser : function(){
    var that = this;
    return getCookies('pinboard.in', 'login').addCallback(function(cookies) {
      var cookie = cookies[0];
      if (!cookie) {
        new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
      return cookie.value;
    });
  },

  post : function(ps){
    var that = this;
    return succeed().addCallback(function(){
      return that.getCurrentUser().addCallback(function() {
        return request('https://pinboard.in/add', {
          queryString : {
            title : ps.item,
            url   : ps.itemUrl,
          }
        });
      });
    }).addCallback(function(res) {
      var form = formContents(res.responseText, true);
      return request('https://pinboard.in/add', {
        sendContent : update(form, {
          title       : ps.item,
          url         : ps.itemUrl,
          description : joinText([ps.body, ps.description], ' ', true),
          tags        : joinText(ps.tags, ' '),
          private     :
            (ps.private == null)? form.private :
            (ps.private)? 'on' : '',
        }),
      });
    });
  },

  getUserTags : function(){
    var that = this;
    return succeed().addCallback(function(){
      return that.getCurrentUser().addCallback(function(username) {
        return request('https://pinboard.in/u:' + username, {
          queryString: {
            mode: 'list',
            floor: 1
          }
        });
      });
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      return $X('id("tag_cloud")//a[contains(@class, "tag")]/text()', doc).map(function(tag) {
        return {
          name: tag,
          frequency: 0
        };
      });
    });
  },

  getRecommendedTags : function(url){
    return request('https://pinboard.in/ajax_suggest', {
      queryString : {
        url : url,
      }
    }).addCallback(function(res){
      // 空配列ではなく、空文字列が返ることがある
      return res.responseText?
        JSON.parse(res.responseText).map(function(tag){
          // 数字のみのタグが数値型になるのを避ける
          return '' + tag;
        }) : [];
    });
  },

  getSuggestions : function(url){
    var that = this;
    var ds = {
      tags        : this.getUserTags(),
      recommended : this.getRecommendedTags(url),
      suggestions : succeed().addCallback(function(){
        return that.getCurrentUser().addCallback(function() {
          return request('https://pinboard.in/add', {
            queryString : {
              url : url,
            }
          });
        });
      }).addCallback(function(res){
        var form = formContents(res.responseText);
        return {
          editPage : 'https://pinboard.in/add?url=' + url,
          form : {
            item        : form.title,
            description : form.description,
            tags        : form.tags.split(' '),
            private     : !!form.private,
          },

          // 入力の有無で簡易的に保存済みをチェックする
          // (submitボタンのラベルやalertの有無でも判定できる)
          duplicated : !!(form.tags || form.description),
        }
      })
    };

    return new DeferredHash(ds).addCallback(function(ress){
      var res = ress.suggestions[1];
      res.recommended = ress.recommended[1];
      res.tags = ress.tags[1];

      return res;
    });
  }
});

Models.register({
  name : 'Delicious',
  ICON : 'http://www.delicious.com/favicon.ico',
  LINK : 'http://www.delicious.com/',
  LOGIN_URL : 'https://secure.delicious.com/login',

  /**
   * ユーザーの利用しているタグ一覧を取得する。
   *
   * @param {String} user 対象ユーザー名。未指定の場合、ログインしているユーザー名が使われる。
   * @return {Array}
   */
  getUserTags : function(user){
    return this.getCurrentUser(user).addCallback(function(user){
      // 同期でエラーが起きないようにする
      return succeed().addCallback(function(){
        return request('http://feeds.delicious.com/v2/json/tags/' + user);
      }).addCallback(function(res){
        var tags = JSON.parse(res.responseText);
        if (!tags) {
          return tags;
        }
        return Object.keys(tags).reduce(function(memo, tag){
          if (tag) {
            memo.push({
              name      : tag,
              frequency : tags[tag]
            });
          }
          return memo;
        }, []);
      });
    });
  },

  /**
   * タグ、おすすめタグ、ネットワークなどを取得する。
   * ブックマーク済みでも取得することができる。
   *
   * @param {String} url 関連情報を取得する対象のページURL。
   * @return {Object}
   */
  getSuggestions : function(url){
    var that = this;
    var ds = {
      tags : this.getUserTags(),
      suggestions : this.getRecommendedTags(url)
    };
    return new DeferredHash(ds).addCallback(function(ress){
      if(!ress['tags'][0] || !ress['suggestions'][0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
      var res = ress.suggestions[1];
      res.tags = ress.tags[1];
      return res;
    });
  },

  getRecommendedTags: function(url) {
    return request('http://feeds.delicious.com/v2/json/urlinfo/' + MD5.hex_md5(url)).addCallback(function(res){
      var result = JSON.parse(res.responseText);
      if (result.length) {
        var top_tags = result[0].top_tags;
        if (top_tags) {
          // get top_tags
          return {
            recommended : Object.keys(top_tags),
            duplicated : false,
          };
        }
      }
      return {
        recommended: [],
        duplicated: false
      };
    });
  },

  getCurrentUser : function(defaultUser){
    if (defaultUser) {
      return succeed(defaultUser);
    } else if (this.currentUser) {
      return succeed(this.currentUser);
    } else {
      var that = this;
      return getCookies('.delicious.com', 'deluser').addCallback(function(cookies) {
        if (!cookies.length) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        return that.getInfo().addCallback(function(info) {
          if (!info.is_logged_in) {
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
          }
          return info.logged_in_username;
        });
      });
    }
    function extractUsername(username) {
      var matched = decodeURIComponent(username).match(/^(.*?) /);
      return (matched) ? matched[1] : null;
    }
  },

  getInfo : function(){
    return request('http://delicious.com/save/quick', {method : 'POST'}).addCallback(function(res) {
      return JSON.parse(res.responseText);
    });
  },

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  transformForm: function (form) {
    var template = {
      'url': 'url',
      'oldUrl': 'oldUrl',
      'title': 'title',
      'tags': 'tags',
      'note': 'note',
      'stackId': 'stack_id',
      'private': 'private',
      'csrfToken': 'csrf_token'
    };
    var res = { };
    for (var key in form) {
      var target = template[key];
      if (target) {
        res[target] = form[key];
      }
    }
    return res;
  },

  post : function(ps){
    var that = this;
    return this.getCurrentUser().addCallback(function(user) {
      return request('http://www.delicious.com/save', {
        queryString :  {
          url   : ps.itemUrl,
          title : ps.item
        }
      }).addCallback(function(res){
        var doc = createHTML(res.responseText);
        return request('http://www.delicious.com/save', {
          sendContent : that.transformForm(update(formContents(doc, true), {
            title       : ps.item,
            url         : ps.itemUrl,
            note        : joinText([ps.body, ps.description], ' ', true),
            tags        : joinText(ps.tags, ','),
            private     : !!ps.private
          }))
        });
      });
    });
  }
});

Models.register({
  name : 'LivedoorClip',
  ICON : 'http://clip.livedoor.com/favicon.ico',
  POST_URL : 'http://clip.livedoor.com/clip/add',
  LOGIN_URL: 'https://member.livedoor.com/login/',
  LINK : 'http://clip.livedoor.com/',

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var self = this;
    return request(this.POST_URL, {
      queryString: {
        link: ps.itemUrl,
        cache: Date.now()
      }
    }).addCallback(function(res) {
      var doc = createHTML(res.responseText);
      if ($X('id("loginFormbox")', doc)[0]) {
        delete self['token'];
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      } else {
        var form = $X('//form[@name="clip"]',doc)[0];
        var content = formContents(form);
        return request(LivedoorClip.POST_URL, {
          //denyRedirection: true,
          sendContent : update(content, {
            rate    : ps.rate? ps.rate : '0',
            title   : ps.item,
            tags    : ps.tags? ps.tags.join(' ') : '',
            notes   : joinText([ps.body, ps.description], ' ', true),
            public  : ps.private? 'off' : 'on'
          }),
          queryString : {
            cache: Date.now()
          }
        }).addCallback(function(res){
          var doc = createHTML(res.responseText);
          if($X('id("loginFormbox")', doc)[0]){
            delete self['token'];
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
          }
        });
      }
    });
  },

  getSuggestions : function(url){
    var self = this;
    return request(LivedoorClip.POST_URL, {
      queryString : {
        link : url || 'http://tombloo/',
        cache: Date.now()
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("loginFormbox")', doc)[0]){
        delete self['token'];
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      } else {
        return {
          duplicated : !!$X('//form[@name="delete_form"]', doc)[0],
          tags : $X('//div[@class="TagBox"]/span/text()', doc).map(function(tag){
            return {
              name      : tag,
              frequency : -1
            };
          })
        };
      }
    });
  }
});

Models.register({
  name : 'Google',
  ICON : 'http://www.google.com/favicon.ico'
});

// copied from http://userscripts.org/scripts/show/19741
Models.register({
  name : 'GoogleWebHistory',
  ICON : Models.Google.ICON,

  getCh : function(url){
    function r(x,y){
      return Math.floor((x/y-Math.floor(x/y))*y+.1);
    }
    function m(c){
      var i,j,s=[13,8,13,12,16,5,3,10,15];
      for(i=0;i<9;i+=1){
        j=c[r(i+2,3)];
        c[r(i,3)]=(c[r(i,3)]-c[r(i+1,3)]-j)^(r(i,3)==1?j<<s[i]:j>>>s[i]);
      }
    }

    return (this.getCh = function(url){
      url='info:'+url;

      var c = [0x9E3779B9,0x9E3779B9,0xE6359A60],i,j,k=0,l,f=Math.floor;
      for(l=url.length ; l>=12 ; l-=12){
        for(i=0 ; i<16 ; i+=1){
          j=k+i;c[f(i/4)]+=url.charCodeAt(j)<<(r(j,4)*8);
        }
        m(c);
        k+=12;
      }
      c[2]+=url.length;

      for(i=l;i>0;i--)
        c[f((i-1)/4)]+=url.charCodeAt(k+i-1)<<(r(i-1,4)+(i>8?1:0))*8;
      m(c);

      return'6'+c[2];
    })(url);
  },

  post : function(url){
    return request('http://www.google.com/search?client=navclient-auto&ch=' + GoogleWebHistory.getCh(url) + '&features=Rank&q=info:' + escape(url));
  }
});

Models.register({
  name : 'GoogleBookmarks',
  ICON     : chrome.extension.getURL('skin/google-bookmark.png'),
  LINK : 'http://www.google.com/bookmarks/',
  LOGIN_URL : 'https://www.google.com/accounts/ServiceLogin',
  POST_URL : 'https://www.google.com/bookmarks/mark',

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var that = this;
    return request(this.POST_URL, {
      queryString :  {
        op : 'edit',
        output : 'popup'
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(doc.getElementById('gaia_loginform'))
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));

      var form = $X('descendant::form[contains(concat(" ",normalize-space(@name)," ")," add_bkmk_form ")]', doc)[0];
      var fs = formContents(form);
      return request('https://www.google.com'+form.getAttribute('action'), {
        //denyRedirection: true,
        sendContent  : update(fs, {
          title      : ps.item,
          bkmk       : ps.itemUrl,
          annotation : joinText([ps.body, ps.description], ' ', true),
          labels     : ps.tags? ps.tags.join(',') : ''
        })
      });
    });
  },

  getEntry : function(url){
    return request(this.POST_URL, {
      queryString : {
        op     : 'edit',
        output : 'popup',
        bkmk   : url
      }
    }).addCallback(function(res) {
      var doc = createHTML(res.responseText);
      var form = formContents(doc);
      return {
        saved       : (/(edit|編集)/i).test($X('//h1/text()', doc)[0]),
        item        : form.title,
        tags        : form.labels.split(/,/).map(methodcaller('trim')),
        description : form.annotation
      };
    });
  },

  getUserTags : function() {
    return request('https://www.google.com/bookmarks/api/bookmark', {
      queryString : {
        op : 'LIST_LABELS'
      }
    }).addCallback(function(res){
      var data = JSON.parse(res.responseText);
      return zip(data['labels'], data['counts']).map(function(pair){
        return {
          name      : pair[0],
          frequency : pair[1]
        };
      });
    });
  },

  getSuggestions : function(url){
    var that = this;
    return new DeferredHash({
      tags  : this.getUserTags(),
      entry : this.getEntry(url)
    }).addCallback(function(ress){
      if (!ress['tags'][0] || !ress['entry'][0]) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
      var entry = ress.entry[1];
      var tags = ress.tags[1];
      return {
        form        : entry.saved? entry : null,
        tags        : tags,
        duplicated  : entry.saved,
        recommended : [],
        editPage    : that.POST_URL + '?' + queryString({
          op   : 'edit',
          bkmk : url
        })
      };
    });
  }
});

Models.register({
  name: 'GoogleCalendar',
  ICON: 'http://calendar.google.com/googlecalendar/images/favicon.ico',

  check: function(ps) {
    return /regular|link/.test(ps.type) && !ps.file;
  },

  getAuthCookie: function() {
    var that = this;
    return getCookies('www.google.com', 'secid').addCallback(function(cookies) {
      if (cookies.length) {
        return cookies[cookies.length-1].value;
      } else {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
    });
  },

  post: function(ps) {
    if (ps.item && (ps.itemUrl || ps.description)) {
      return this.addSchedule(
          ps.item, joinText([ps.itemUrl, ps.body, ps.description], '\n'), ps.date);
    } else {
      return this.addSimpleSchedule(ps.description);
    }
  },

  addSimpleSchedule: function(description){
    return this.getAuthCookie().addCallback(function(cookie) {
      var endpoint = 'http://www.google.com/calendar/m';
      return request(endpoint, {
        queryString : {
          hl : 'en'
        }
      }).addCallback(function(res) {
        // form.secidはクッキー内のsecidとは異なる
        var doc = createHTML(res.responseText);
        var form = formContents(doc);
        return request(endpoint, {
          redirectionLimit : 0,
          sendContent: {
            ctext  : description,
            secid  : form.secid,
            as_sdt : form.as_sdt
          }
        });
      });
    });
  },

  addSchedule: function(title, description, from, to) {
    var that = this;
    from = from || new Date();
    to = to || new Date(from.getTime() + (86400 * 1000));
    return this.getAuthCookie().addCallback(function(cookie) {
      return request('http://www.google.com/calendar/event', {
          queryString : {
            action  : 'CREATE',
            secid   : cookie,
            dates   : that.createDateString(from) + '/' + that.createDateString(to),
            text    : title,
            details : description,
            sf      : true,
            crm     : 'AVAILABLE',
            icc     : 'DEFAULT',
            output  : 'js',
            scp     : 'ONE'
          }
      });
    });
  },

  createDateString: function(date) {
    var y = date.getFullYear().toString();
    var m = (date.getMonth() + 1).toString();
    if (m.length === 1) {
      m = '0' + m;
    }
    var d = date.getDate().toString();
    if (d.length === 1) {
      d = '0' + d;
    }
    return y + m + d;
  }
});

Models.register({
  name : 'GoogleImage',
  ICON :  Models.Google.ICON,
  checkSearch : function(ps) {
    return ps.type === 'photo' && !ps.file;
  },
  search: function(ps) {
    // search by itemUrl
    var ret = new Deferred();
    var url = "http://www.google.co.jp/searchbyimage" + queryString({
      image_url: ps.itemUrl
    }, true);
    chrome.tabs.create({
      url: url
    }, function() {
      ret.callback();
    });
    return ret;
  }
});

Models.register({
  name     : 'ChromeBookmark',
  ICON     : chrome.extension.getURL('skin/chromium.ico'),
  check : function(ps){
    return ps.type === 'link';
  },
  post : function(ps){
    return this.getExFolder().addCallback(function(ex){
      var ret = new Deferred();
      chrome.bookmarks.create({
        parentId: ex.id,
        title   : ps.item,
        url     : ps.itemUrl
      }, function(){
        ret.callback();
      });
      return ret;
    });
  },
  getExFolder: function(){
    var ret = new Deferred();
    chrome.bookmarks.getTree(function(tree){
      var top = tree[0].children[1];
      var ex;
      if(top.children.some(function(obj){
        if(obj.title === 'TBRL'){
          ex = obj;
          return true;
        } else {
          return false;
        }
      })){
        ret.callback(ex);
      } else {
        chrome.bookmarks.create({
          parentId: top.id,
          title   : 'TBRL'
        }, function(obj){
          ret.callback(obj);
        });
      }
    });
    return ret;
  }
});

Models.register({
  name     : 'Evernote',
  ICON     : 'http://www.evernote.com/favicon.ico',
  POST_URL : 'https://www.evernote.com/clip.action',
  LOGIN_URL: 'https://www.evernote.com/Login.action',
  LINK     : 'http://www.evernote.com/',

  check : function(ps){
    return /regular|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var that = this;
    ps = update({}, ps);
    var d = succeed();
    if(ps.type==='link' && !ps.body && TBRL.Config['post']['evernote_clip_fullpage']){
      d = encodedRequest(ps.itemUrl).addCallback(function(res){
        var doc = createHTML(res.responseText);
        ps.body = convertToHTMLString(doc.documentElement, true);
      });
    }

    return d.addCallback(function(){
      return that.getToken();// login checkも走る
    }).addCallback(function(token){
      return request(that.POST_URL, {
        redirectionLimit : 0,
        sendContent : update(token, {
          saveQuicknote : 'save',
          format        : 'microclip',

          url      : ps.itemUrl || 'no url',
          title    : ps.item || 'no title',
          comment  : ps.description,
          body     : getFlavor(ps, 'html'),
          tags     : joinText(ps.tags, ','),
          fullPage : (ps.body)? 'true' : 'false'
        })
      });
    });
  },

  getToken : function(){
    var that = this;
    return request(this.POST_URL, {
      sendContent: {
        format    : 'microclip',
        quicknote : 'true'
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("login_form")', doc)[0]) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }

      return {
        _sourcePage   : $X('//input[@name="_sourcePage"]/@value', doc)[0],
        __fp          : $X('//input[@name="__fp"]/@value', doc)[0],
        noteBookGuide : $X('//select[@name="notebookGuid"]//option[@selected="selected"]/@value', doc)[0]
      };
    });
  }
});

Models.register({
  name : 'FriendFeed',
  ICON : 'http://friendfeed.com/favicon.ico',
  LINK : 'http://friendfeed.com/',
  LOGIN_URL : 'https://friendfeed.com/account/login',
  check : function(ps){
    return (/photo|quote|link|conversation|video/).test(ps.type) && !ps.file;
  },

  getToken : function(){
    var self = this;
    return request('http://friendfeed.com/share/bookmarklet/frame')
    .addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('descendant::span[child::a[@href="http://friendfeed.com/account/login"]]', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      return $X('descendant::input[contains(concat(" ",normalize-space(@name)," ")," at ")]/@value', doc)[0];
    });
  },

  post : function(ps){
    var self = this;
    return this.getToken().addCallback(function(token){
      return request('https://friendfeed.com/a/bookmarklet', {
        //denyRedirection: true,
        sendContent : {
          at      : token,
          link    : ps.pageUrl,
          title   : ps.page,
          image0  : ps.type === 'photo'? ps.itemUrl : '',
          comment : joinText([ps.body, ps.description], ' ', true)
        }
      });
    });
  }
});

Models.register({
  name : 'Twitter',
  ICON : 'http://twitter.com/favicon.ico',
  URL  : 'https://twitter.com',
  LINK : 'https://twitter.com/',
  LOGIN_URL : 'https://twitter.com/login',
  SHORTEN_SERVICE : 'bit.ly',

  check : function(ps) {
    return /regular|photo|quote|link|conversation|video/.test(ps.type);
  },

  createStatus : function(ps) {
    var self     = this;
    var template = TBRL.Config['entry']['twitter_template'];
    var status   = '';
    var maxlen   = 140;
    if (ps.type === 'photo') {
      ps = update({}, ps);
      ps.item    = ps.page;
      ps.itemUrl = ps.pageUrl;
      maxlen     = 119;
    }
    if (!template) {
      status = joinText([ps.description, (ps.body)? '"' + ps.body + '"' : '', ps.item, ps.itemUrl], ' ');
    } else {
      status = templateExtract(template,{
        description   : ps.description,
        description_q : (ps.description) ? '"' + ps.description + '"' : null,
        body          : ps.body,
        body_q        : (ps.body) ? '"' + ps.body + '"' : null,
        title         : ps.item,
        title_q       : (ps.item) ? '"' + ps.item + '"' : null,
        link          : ps.itemUrl,
        link_q        : (ps.itemUrl) ? '"' + ps.itemUrl + '"' : null
      });
    }
    var ret = new Deferred();
    if ((status.length < maxlen) && !TBRL.Config['post']['always_shorten_url']) {
      ret.callback(status);
    } else {
      shortenUrls(status, Models[self.SHORTEN_SERVICE])
        .addCallback(function(status) {
          if (status.length < maxlen) {
            ret.callback(status);
          } else {
            ret.errback('too many characters to post (' + (status.length - maxlen) + ' over)');
          }
        });
    }
    return ret;
  },

  post : function(ps) {
    var self = this;
    return this.createStatus(ps).addCallback(function(status) {
      if (ps.type === 'photo') {
        return self.download(ps).addCallback(function(file) {
          return self.upload(ps, status, file);
        });
      }
      return self.update(status);
    });
  },

  update : function(status) {
    var self = this;
    return this.getToken().addCallback(function(token) {
      // FIXME: 403が発生することがあったため redirectionLimit:0 を外す
      token.status = status;
      return request(self.URL + '/status/update', update({
        sendContent : token
      }));
    }).addCallback(function(res) {
      var msg = res.responseText.extract(/notification.setMessage\("(.*?)"\)/);
      if (msg)
        throw unescapeHTML(msg).trimTag();
    });
  },

  favor : function(ps) {
    return this.addFavorite(ps.favorite.id);
  },

  getToken : function() {
    var self = this;
    return request(this.URL + '/account/settings').addCallback(function(res) {
      var html = res.responseText;
      if (~html.indexOf('login'))
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      return {
        authenticity_token : html.extract(/authenticity_token.+value="(.+?)"/),
        siv                : html.extract(/logout\?siv=(.+?)"/)
      }
    });
  },

  remove : function(id) {
    var self = this;
    return this.getToken().addCallback(function(ps) {
      ps._method = 'delete';
      return request(self.URL + '/status/destroy/' + id, {
        //denyRedirection: true,
        referrer : self.URL + '/',
        sendContent : ps
      });
    });
  },

  addFavorite : function(id) {
    var self = this;
    return this.getToken().addCallback(function(ps) {
      return request(self.URL + '/favourings/create/' + id, {
        //denyRedirection: true,
        referrer : self.URL + '/',
        sendContent : ps
      });
    });
  },

  getRecipients : function() {
    var self = this;
    return request(this.URL + '/direct_messages/recipients_list?twttr=true').addCallback(function(res) {
      return map(function(pair){
        return {id:pair[0], name:pair[1]};
      }, JSON.parse('(' + res.responseText + ')'));
    });
  },

  download : function(ps) {
    return (
      ps.file ? succeed(ps.file)
        : download(ps.itemUrl).addCallback(function(entry) {
          return getFileFromEntry(entry);
        })
    );
  },

  upload : function(ps, status, file) {
    var self = this;
    var RECEVIER_URL = 'https://upload.twitter.com/receiver.html';
    var UPLOAD_URL = 'https://upload.twitter.com/1/statuses/update_with_media.json';
    var SIZE_LIMIT = 3145728;

    if (file.fileSize > SIZE_LIMIT) {
      throw new Error('exceed the photo size limit (' + SIZE_LIMIT + ')');
    }

    return this.getToken().addCallback(function(token) {
      return fileToBinaryString(file).addCallback(function(binary) {
        return request(RECEVIER_URL, {
          headers : {
            Referer : self.URL
          }
        }).addCallback(function(res) {
          return request(UPLOAD_URL, {
            sendContent : {
              status                  : status,
              'media_data[]'          : window.btoa(binary),
              include_entities        : 'true',
              post_authenticity_token : token.authenticity_token
            },
            headers : {
              Referer            : RECEVIER_URL,
              'X-Phx'            : true,
              'X-Requested-With' : 'XMLHttpRequest'
            }
          }).addCallback(function(res) {
            var json = JSON.parse(res.responseText);
            if (json.error) {
              throw new Error(json.error);
            }
            return json;
          });
        });
      });
    });
  }
});

Models.register({
  name : 'Instapaper',
  ICON : chrome.extension.getURL('skin/instapaper.ico'),
  LINK : 'http://www.instapaper.com/',
  POST_URL: 'http://www.instapaper.com/edit',
  LOGIN_URL : 'https://www.instapaper.com/user/login',
  check : function(ps){
    return /quote|link/.test(ps.type);
  },
  post : function(ps){
    var url = this.POST_URL;
    var self = this;
    return request(url).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(!$X('id("userpanel")/a[contains(concat(" ",normalize-space(@href)," "), " /user/logout ")]', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      return $X('//input[@id="form_key"]/@value', doc)[0];
    }).addCallback(function(token){
      return request(url, {
        //denyRedirection: true,
        sendContent: {
          'form_key': token,
          'bookmark[url]': ps.itemUrl,
          'bookmark[title]': ps.item,
          'bookmark[selection]': joinText([ps.body, ps.description])
        }
      });
    });
  }
});

Models.register({
  name : 'ReadItLater',
  ICON : 'http://readitlaterlist.com/favicon.ico',
  LINK : 'http://readitlaterlist.com/',
  LOGIN_URL : 'http://readitlaterlist.com/l',
  check : function(ps){
    return /quote|link/.test(ps.type);
  },
  post : function(ps){
    var that = this;
    return request('http://readitlaterlist.com/edit').addCallback(function(res) {
      var doc = createHTML(res.responseText);
      var form = $X('id("content")/form', doc)[0];
      if (/login/.test(form.getAttribute('action'))) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      } else {
        return request('http://readitlaterlist.com/edit_process.php', {
          queryString: {
            BL: 1
          },
          sendContent: update(formContents(form), {
            tags : ps.tags? ps.tags.join(',') : '',
            title: ps.item,
            url  : ps.itemUrl
          })
        });
      }
    });
  }
});

// http://developer.yahoo.co.jp/jlp/MAService/V1/parse.html
// APP_ID => Taberareloo ID
Models.register({
  name : 'Yahoo',
  APP_ID : 'KaZybVOxg67G6sNQLuSMqenqXLGGIbfVJGCWgHrPWGMlQS5BGWIgAVcueAxAByQBatwmBYewBgEs3.3y',
  // 冗長な表記を許すcode map
  // 配列の許容 配列は優先度が高いものを先頭に
  katakana: {
    'ウァ':'wha','ウィ':'wi','ウェ':'we','ウォ':'who',
    'キャ':'kya','キィ':'kyi','キュ':'kyu','キェ':'kye','キョ':'kyo',
    'クャ':'qya','クュ':'qyu',
    'クァ':'qwa','クィ':'qwi','クゥ':'qwu','クェ':'qwe','クォ':'qwo',
    'ギャ':'gya','ギィ':'gyi','ギュ':'gyu','ギェ':'gye','ギョ':'gyo',
    'グァ':'gwa','グィ':'gwi','グゥ':'gwu','グェ':'gwe','グォ':'gwo',
    'シャ':['sha','sha','sya'],'シィ':'syi','シュ':['shu','syu'],'シェ':['sye','she'],'ショ':['sho','sho'],
    'スァ':'swa','スィ':'swi','スゥ':'swu','スェ':'swe','スォ':'swo',
    'ジャ':['ja','zya'],'ジィ':['jyi','zyi'],'ジュ':['ju','zyu'],'ジェ':['je','zye','jye'],'ジョ':['zyo','jo'],
    'チャ':'cha','チィ':'tyi','チュ':'chu','チェ':'tye','チョ':'cho',
    'ツァ':'tsa','ツィ':'tsi','ツェ':'tse','ツォ':'tso',
    'テャ':'tha','ティ':'thi','テュ':'thu','テェ':'the','テョ':'tho',
    'トァ':'twa','トィ':'twi','トゥ':'twu','トェ':'twe','トォ':'two',
    'ヂャ':'dya','ヂィ':'dyi','ヂュ':'dyu','ヂェ':'dye','ヂョ':'dyo',
    'デャ':'dha','ディ':'dhi','デュ':'dhu','デェ':'dhe','デョ':'dho',
    'ドァ':'dwa','ドィ':'dwi','ドゥ':'dwu','ドェ':'dwe','ドォ':'dwo',
    'ニャ':'nya','ニィ':'nyi','ニュ':'nyu','ニェ':'nye','ニョ':'nyo',
    'ヒャ':'hya','ヒィ':'hyi','ヒュ':'hyu','ヒェ':'hye','ヒョ':'hyo',
    'フャ':'fya','フュ':'fyu','フョ':'fyo',
    'ファ':'fa','フィ':'fi','フゥ':'fwu','フェ':'fe','フォ':'fo',
    'ビャ':'bya','ビィ':'byi','ビュ':'byu','ビェ':'bye','ビョ':'byo',
    'ヴァ':'va','ヴィ':'vi','ヴ':'vu','ヴェ':'ve','ヴォ':'vo',
    'ヴャ':'vya','ヴュ':'vyu','ヴョ':'vyo',
    'ピャ':'pya','ピィ':'pyi','ピュ':'pyu','ピェ':'pye','ピョ':'pyo',
    'ミャ':'mya','ミィ':'myi','ミュ':'myu','ミェ':'mye','ミョ':'myo',
    'リャ':'rya','リィ':'ryi','リュ':'ryu','リェ':'rye','リョ':'ryo',

    'ア':'a','イ':'i','ウ':'u','エ':'e','オ':'o',
    'カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
    'サ':'sa','シ':['shi','si'],'ス':'su','セ':'se','ソ':'so',
    'タ':'ta','チ':['chi','ti'],'ツ':['tsu','tu'],'テ':'te','ト':'to',
    'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no',
    'ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
    'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo',
    'ヤ':'ya','ユ':'yu','ヨ':'yo',
    'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro',
    'ワ':'wa','ヲ':'wo','ン':'nn',
    'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go',
    'ザ':'za','ジ':['ji','zi'],'ズ':'zu','ゼ':'ze','ゾ':'zo',
    'ダ':'da','ヂ':'di','ヅ':'du','デ':'de','ド':'do',
    'バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
    'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po',

    'ァ':'la','ィ':'li','ゥ':'lu','ェ':'le','ォ':'lo',
    'ヵ':'lka','ヶ':'lke','ッ':'ltu',
    'ャ':'lya','ュ':'lyu','ョ':'lyo','ヮ':'lwa',
    '。':".",'、':",",'ー':"-"
  },
  lengthMap: {},

  parse : function(ps){
    ps.appid = this.APP_ID;
    return request('http://jlp.yahooapis.jp/MAService/V1/parse', {
      charset     : 'application/xml; charset=utf-8',
      sendContent : ps
    }).addCallback(function(res){
      return res.responseXML;
    });
  },

  getKanaReadings : function(str){
    return this.parse({
      sentence : str,
      response : 'reading'
    }).addCallback(function(res){
      return $X('descendant::reading/text()', res);
    });
  },

  getRomaReadings : function(str){
    return this.getKanaReadings(str).addCallback(function(rs){
      return rs.join('\u0000').toRoma().split('\u0000');
    });
  },

  // experimental
  // tag取得専用なのでstrで返却しません
  // 同一の読み仮名に対して複数のpatternを許容する
  // 重たくなるかも? なる、なの :おまひま
  getSparseTags : function(tags, str, delimiter){
    if(!delimiter) delimiter = ' [';
    var self = this;
    return this.getKanaReadings(str).addCallback(function(rs){
      var katakana = rs.join('').split(' [').join('\u0000').toKatakana();
      var katakanas = katakana.split('\u0000');
      return zip(self.toSparseRomaReadings(katakana), tags).map(function(pair, index){
        var reading = pair[0], tag = pair[1];
        // 再計算flagがたっているか. 分岐考慮型計算は時間食うのでできるだけしない.
        if(~reading.indexOf('\u0001')){
          var res = {
            readings: self.duplicateRomaReadings(katakanas[index]),
            value: tag
          };
          return res;
        } else {
          return {
            value: tag,
            reading: reading
          };
        }
      });
    });
  },

  duplicateRomaReadings:function(s){
    // 分岐件数依存で一定数(この場合20)以上になるようであれば打ち切る(Tombloo標準の優先文字を使う)
    // 分岐件数が「ジェジェジェジェジェジェジェジェジェジェジェ」などになると天文学的になるのに対する対応
    // abbreviation scorerが後になるほど評価対象として低いので, 結果に影響が出ない
    var stack = [];
    var count = 1;
    for(var i = 0, roma, kana, table = this.katakana ; i < s.length ; i += kana.length){
      kana = s.substring(i, i+2);
      roma = table[kana];

      if(!roma){
        kana = s.substring(i, i+1);
        roma = table[kana] || kana;
      }

      var len = this.lengthMap[kana];
      if(len){
        var r = count * len;
        if(r > 20){
          stack.push(roma[0]);
        } else {
          count=r;
          stack.push(roma);
        }
      } else {
        stack.push(roma);
      }
    }
    return this.stackWalker(stack).map(function(l){ return l.join('') });
  },

  stackWalker: function(stack){
    var res = [];
    var last_num = stack.length;
    function walker(current, current_num){
      var next = current_num + 1;
      var elements = stack[current_num];
      var returnee = res[current_num];
      if(Array.isArray(elements)){
        for(var i = 0, len = elements.length; i < len; ++i){
          var element = elements[i];
          var d = $A(current);
          d.push(element);
          returnee.push(d);
          if(next !== last_num)
            walker(d, next)
        }
      } else {
        // 一つしかないときはcloneする必要がない
        current.push(elements);
        returnee.push(current);
        if(next !== last_num)
          walker(current, next)
      }
    }
    for(var i = 0; i < last_num; ++i) res[i] = [];
    walker([], 0);
    return res[last_num-1];
  },

  toSparseRomaReadings: function(s){
    var res = [];
    for(var i = 0, roma, kana, table = this.katakana, len = s.length; i < len; i += kana.length){
      kana = s.substring(i, i+2);
      roma = table[kana];

      if(!roma){
        kana = s.substring(i, i+1);
        roma = table[kana] || kana;
      }

      if(kana in this.lengthMap){
        roma = '\u0001';// contains flag
      }

      res.push(roma);
    }
    return res.join('').replace(/ltu(.)/g, '$1$1').split('\u0000');
  }

});
items(Models.Yahoo.katakana).forEach(function(pair){
  var val = pair[1];
  if(Array.isArray(val))
    Models.Yahoo.lengthMap[pair[0]] = val.length;
});

Models.register({
  name : 'YahooBookmarks',
  ICON : 'http://bookmarks.yahoo.co.jp/favicon.ico',
  LINK : 'http://bookmarks.yahoo.co.jp/',
  LOGIN_URL : 'https://login.yahoo.co.jp/config/login?.src=bmk2',

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var self = this;
    return request('http://bookmarks.yahoo.co.jp/action/post').addCallback(function(res){
      if(res.responseText.indexOf('login_form')!=-1)
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      var doc = createHTML(res.responseText);
      return formContents($X('id("addbookmark")/descendant::div[contains(concat(" ",normalize-space(@class)," ")," bd ")]', doc)[0]);
    }).addCallback(function(fs){
      return request('http://bookmarks.yahoo.co.jp/action/post/done', {
        //denyRedirection: true,
        sendContent  : {
          title      : ps.item,
          url        : ps.itemUrl,
          desc       : joinText([ps.body, ps.description], ' ', true),
          tags       : ps.tags? ps.tags.join(' ') : '',
          crumbs     : fs.crumbs,
          visibility : ps.private===null? fs.visibility : (ps.private? 0 : 1)
        }
      });
    });
  },

  /**
   * タグ、おすすめタグを取得する。
   * ブックマーク済みでも取得することができる。
   *
   * @param {String} url 関連情報を取得する対象のページURL。
   * @return {Object}
   */
  getSuggestions : function(url){
    var self = this;
    return request('http://bookmarks.yahoo.co.jp/bookmarklet/showpopup', {
      queryString : {
        u : url
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(!$X('id("bmtsave")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      function getTags(part){
        try{
          return JSON.parse(unescapeHTML(res.responseText.extract(RegExp('^' + part + ' ?= ?(.+);$', 'm'), 1))) || [];
        }catch(e){
          return [];
        }
      }

      return {
        duplicated : !!$X('//input[@name="docid"]', doc)[0],
        popular : getTags('rectags'),
        tags : getTags('yourtags').map(function(tag){
          return {
            name      : tag,
            frequency : -1
          }
        })
      };
    });
  }
});

Models.register({
  name : 'Wassr',
  ICON : 'http://wassr.jp/favicon.ico',
  LINK : 'http://wassr.jp/',
  LOGIN_URL : 'http://wassr.jp/',

  check : function(ps){
    return /regular|photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    return this.addMessage(joinText([ps.item, ps.itemUrl, ps.body, ps.description], ' ', true));
  },

  addMessage : function(message){
    var self = this;
    return request('http://wassr.jp/my/').addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("LoginForm")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      return request('http://wassr.jp/my/status/add', {
        //redirectionLimit : 0,
        sendContent : update(formContents($X('id("HeadBox")/descendant::form', doc)[0]), {
          message : message
        })
      });
    })
  }
});

Models.register({
  name: 'Clipp',
  ICON : chrome.extension.getURL('skin/item.ico'),
  CLIPP_URL: 'http://clipp.in/',
  LINK : 'http://clipp.in/',
  LOGIN_URL: 'http://clipp.in/account/login',

  check: function(ps) {
    return /photo|quote|link|video/.test(ps.type) && !ps.file;
  },
  post: function(ps) {
    var endpoint = this.CLIPP_URL + 'bookmarklet/add';
    var self = this;

    return self.postForm(function() {
      return self.getForm(endpoint).addCallback(function(form){
        update(form, self[ps.type.capitalize()].convertToForm(ps));

        self.appendTags(form, ps);

        if (ps.type === 'video' && !form.embed_code) {
          // embed_tagを取得してformに設定する
          var address = form.address;
          return request(address).addCallback(function(res) {
            var doc = createHTML(res.responseText);
            var uri = createURI(address);
            var host = uri ? uri.host : '';
            if (host.match('youtube.com')) {
              form.embed_code = $X('id("embed_code")/@value', doc)[0] || '';
            }
            return request(endpoint, { sendContent: form });
          });
        }
        return request(endpoint, { sendContent: form });
      });
    });
  },
  getForm: function(url) {
    var self = this;
    return request(url).addCallback(function(res) {
      var doc = createHTML(res.responseText);
      var form = $X('//form', doc)[0];
      if(form.getAttribute('action') === '/bookmarklet/account/login'){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      } else {
        return formContents(form);
      }
    });
  },
  appendTags: function(form, ps) {
    return update(form, {
      tags: (ps.tags && ps.tags.length) ? joinText(ps.tags, ',') : ''
    });
  },
  favor: function(ps) {
    // メモをreblogフォームの適切なフィールドの末尾に追加する

    var form = ps.favorite.form;
    items(this[ps.type.capitalize()].convertToForm({
      description: ps.description
    })).forEach(function(pair) {
      var name = pair[0], value = pair[1];
      if (!value) return;
      form[name] += value;
    });

    this.appendTags(form, ps);

    return this.postForm(function(){
      return request(ps.favorite.endpoint, { sendContent: form });
    });
  },
  postForm: function(fn) {
    var CLIPP_URL = this.CLIPP_URL;
    var self = this;
    var d = succeed();
    d.addCallback(fn);
    d.addCallback(function(res) {
      var doc = createHTML(res.responseText);
      if($X('descendant::ul[contains(concat(" ",normalize-space(@class)," ")," error ")]', doc)[0]){
        throw new Error('Error posting entry.');
      } else if($X('//form[@action="/bookmarklet/account/login"]', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
    return d;
  },
  Link: {
    convertToForm: function(ps) {
      return {
        title: ps.item,
        address: ps.itemUrl,
        description: escapeHTML(ps.description)
      };
    }
  },
  Quote: {
    convertToForm: function(ps) {
      return {
        title: ps.item,
        address: ps.itemUrl,
        quote: ps.body ? ps.body.replace(/\n/g, '<br>') : '',
        description: escapeHTML(ps.description)
      };
    }
  },
  Photo: {
    convertToForm: function(ps) {
      return {
        title: ps.item,
        address: ps.pageUrl,
        image_address: ps.itemUrl,
        description: joinText([
          (ps.item ? ps.item.link(ps.pageUrl) : '') + (ps.author ? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
          '<p>' + escapeHTML(ps.description) + '</p>' ], '')
      };
    }
  },
  Video: {
    convertToForm: function(ps) {
      return {
        title: ps.item,
        address: ps.pageUrl,
        embed_code: ps.body || '',
        description: joinText([
          (ps.item ? ps.item.link(ps.pageUrl) : '') + (ps.author ? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
          '<p>' + escapeHTML(ps.description) + '</p>' ], '')
      };
    }
  }
});

Models.register({
  name : 'gist',
  ICON : 'http://gist.github.com/favicon.ico',
  LINK : 'http://gist.github.com/',
  LOGIN_URL : 'https://github.com/login',
  check: function(ps){
    return /regular|quote/.test(ps.type);
  },
  post : function(ps){
    var self = this;
    return request(this.LINK).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(!($X('descendant::div[contains(concat(" ",normalize-space(@class)," ")," userbox ")]', doc)[0])){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      var form = formContents($X('descendant::form[@action="/gists"]', doc)[0]);
      var content;
      switch(ps.type){
        case 'regular':
          content = ps.description;
          break;
        case 'quote':
          content = joinText([ps.body, '', ps.itemUrl, '', ps.description], '\n\n');
          break;
      }
      form['file_contents[gistfile1]'] = content;
      form['file_name[gistfile1]'] = ps.item;
      // public
      delete form['action_button'];
      return request(self.LINK+'gists', {
        sendContent: form
      });
    });
  }
});

Models.register({
  name     : 'PickNaver',
  ICON     : chrome.extension.getURL('skin/pick-naver.png'),
  LINK     : 'http://pick.naver.jp/',
  LOGIN_URL: 'https://ssl.naver.jp/login?fromUrl=http://pick.naver.jp/',

  POST_URL : 'http://naver.jp/api/html/post/mainboard',

  SHORTEN_SERVICE : 'bit.ly',

  check : function(ps){
    return (/(regular|photo|quote|link|video)/).test(ps.type) && !ps.file;
  },

  getAuthCookie: function() {
    var that = this;
    return getCookies('.naver.jp', 'NJID_AUT').addCallback(function(cookies) {
      if (cookies.length) {
        return cookies[cookies.length-1].value;
      } else {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
    });
  },

  post : function(ps) {
    var self = this;
    return this.getAuthCookie().addCallback(function(ok) {
      var status = joinText([
          ps.description,
          ps.type === 'photo' ? ps.page : '',
          ps.type === 'photo' ? ps.pageUrl : '',
          ps.body ? '“' + ps.body + '”' : ''
        ], "\n", true);
      return self.update(status, ps);
    });
  },

  update : function(status, ps) {
    var self = this;
    return maybeDeferred(
      (status.length < 300 && !TBRL.Config['post']['always_shorten_url']) ? status : shortenUrls(status, Models[this.SHORTEN_SERVICE])
    ).addCallback(function(status) {
      var typeCode = 'U';
      var media = {};
      if (ps.type === 'photo') {
        typeCode = 'I';
        media.mediaUrl = ps.itemUrl;
        media.mediaThumbnailUrl = ps.itemUrl;
      }
      else {
        media.mediaUrl = ps.itemUrl || ps.pageUrl;
      }

      return request(self.POST_URL, {
        method : 'POST',
        headers : {
          'Content-Type' : 'application/json; charset=utf-8'
        },
        sendContent : JSON.stringify({
          serviceTypeCode: 'P',
          refererTypeCode: 'W',
          typeCode       : typeCode,
          postText       : status,
          urlTitle       : ps.item || ps.page,
          boardType      : 'mainboard',
          media          : media,
          pointedUser    : [],
          group          : {'groupId': 0},
          rnd            : new Date().getTime()
        })
      });
    })
  }
});

Models.register({
  name: 'Diigo',
  ICON: 'http://www.diigo.com/favicon.ico',
  LINK: 'http://www.diigo.com/',
  check: function(ps) {
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post: function(ps) {
    return this.addBookmark(ps.itemUrl, ps.item, ps.tags, joinText([ps.body, ps.description],' '),ps.private);
  },

  addBookmark: function(url, title, tags, description, priv) {
    return request('http://www.diigo.com/item/new/bookmark').addCallback(function(res){
      var doc = createHTML(res.responseText);
      var element = doc.getElementById('newBookmarkForm');
      if (!element) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      var form = formContents(element);
      return request('http://www.diigo.com/item/save/bookmark', {
        sendContent: update(form, {
          url: url,
          title: title,
          tags: tags.join(' '),
          description: description,
          private: priv
        })
      });
    });
  }
});

// http://www.kawa.net/works/ajax/romanize/japanese.html
Models.register({
  name : 'Kawa',

  getRomaReadings : function(text){
    return request('http://www.kawa.net/works/ajax/romanize/romanize.cgi', {
      queryString : {
        // mecab-utf8
        // japanese
        // kana
        mode : 'japanese',
        q : text
      }
    }).addCallback(function(res){
      /*
      return map(function(s){
        return ''+s.@title || ''+s;
      }, createXML(res.responseText).li.span);
      */
    });
  }
});

Models.register({
  name : 'is.gd',
  ICON : 'http://is.gd/favicon.ico',
  URL  : 'http://is.gd/',

  shorten : function(url){
    if(/\/\/is\.gd\//.test(url))
      return succeed(url);

    return request(this.URL + '/api.php', {
      //denyRedirection: true,
      queryString : {
        longurl : url
      }
    }).addCallback(function(res){
      return res.responseText;
    });
  },

  expand : function(url){
    return request(url, {
      //denyRedirection : true
    }).addCallback(function(res){
      return res.channel.URI.spec;
    });
  }
});

Models.register({
  name    : 'bit.ly',
  ICON    : 'http://bit.ly/static/images/favicon.png',
  URL     : 'http://api.bitly.com/v3',
  API_KEY : 'R_8d078b93e8213f98c239718ced551fad',
  USER    : 'to',
  VERSION : '3.0.0',

  shorten : function(url){
    var self = this;
    if(/\/\/(?:bit\.ly|j\.mp)/.test(url))
      return succeed(url);

    return this.callMethod('shorten', {
      longUrl : url
    }).addCallback(function(res){
      return res.url;
    });
  },

  expand : function(url){
    var hash = url.split('/').pop();
    return this.callMethod('expand', {
      hash : hash,
      shortUrl : url
    }).addCallback(function(res){
      return res['expand'][0].long_url;
    });
  },

  callMethod : function(method, ps){
    var self = this;
    return request(this.URL + '/' + method, {
      queryString : update({
        login   : this.USER,
        apiKey  : this.API_KEY,
        format  : 'json'
      }, ps)
    }).addCallback(function(res){
      res = JSON.parse(res.responseText);
      if(res.status_code !== 200){
        var error = new Error([res.status_code, res.status_txt].join(': '))
        error.detail = res;
        throw error;
      }

      return res.data;
    });
  }
});

Models.register(update({}, Models['bit.ly'], {
  name: 'j.mp',
  ICON: 'http://j.mp/static/images/favicon.png',
  URL : 'http://api.j.mp'
}));

Models.register({
  name       : 'Google+',
  ICON       : 'http://ssl.gstatic.com/s2/oz/images/faviconr.ico',
  LINK       : 'https://plus.google.com/',
  LOGIN_URL  : 'https://plus.google.com/up/start/',

  HOME_URL   : 'https://plus.google.com/',
  BASE_URL   : 'u/0/',
  INIT_URL   : '_/initialdata',
  POST_URL   : '_/sharebox/post/',
  UPLOAD_URL : '_/upload/photos/resumable',
  SNIPPET_URL: '_/sharebox/linkpreview/',

  is_pages : false,

  sequence : 0,

  YOUTUBE_REGEX : /http:\/\/(?:.*\.)?youtube.com\/watch\?v=([a-zA-Z0-9_-]+)[-_.!~*'()a-zA-Z0-9;\/?:@&=+\$,%#]*/g,

  timer : null,

  initialize : function() {
    var self = this;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.is_pages) {
      return;
    }

    var config = TBRL.Config['services'][this.name];
    var enable = false;
    ['regular', 'photo', 'quote', 'link', 'video', 'favorite'].forEach(function(type) {
      if ((config[type] === 'default') || (config[type] === 'enabled')) {
        enable = true;
      }
    });

    if (!enable) {
      return;
    }

    return getCookies('.google.com', 'SSID').addCallback(function(cookies) {
      if (cookies.length) {
        try {
          self._getStreams();
        }
        catch (e) {}
      }
      self.timer = setTimeout(function() {
        self.initialize();
      }, 60000);
    });
  },

  check: function(ps) {
    return /regular|photo|quote|link|video/.test(ps.type);
  },

  getAuthCookie: function() {
    var that = this;
    return getCookies('.google.com', 'SSID').addCallback(function(cookies) {
      if (cookies.length) {
        return cookies[cookies.length-1].value;
      } else {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      }
    });
  },

  getOZData : function() {
    var self = this;
    return this.getInitialData(1).addCallback(function(oz1) {
      return self.getInitialData(2).addCallback(function(oz2) {
        return {'1': oz1, '2': oz2};
      });
   });
  },

  getInitialData : function(key) {
    var self = this;
    var url = this.HOME_URL + this.BASE_URL + this.INIT_URL;
    return request(url + '?' + queryString({
      key    : key,
      _reqid : this.getReqid(),
      rt     : 'j'
    })).addCallback(function(res) {
      var initialData = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
      var data = MochiKit.Base.evalJSON(initialData);
      data = self.getDataByKey(data[0], 'idr');
      if (!data) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      data = MochiKit.Base.evalJSON(data[1]);
      return data[key];
    });
  },

  getDataByKey : function(arr, key) {
    for (var i = 0, len = arr.length ; i < len ; i++) {
      var data = arr[i];
      if (data[0] === key) {
        return data;
      }
    }
    return null;
  },

  getDefaultScope : function() {
    var self = this;
    return this.getInitialData(11).addCallback(function(data) {
      if (!data) return JSON.stringify([]);
      data = MochiKit.Base.evalJSON(data[0]);

      var aclEntries = [];

      for (var i = 0, len = data['aclEntries'].length ; i < len ; i+=2) {
        var scope = data.aclEntries[i].scope;

        if (scope.scopeType === 'anyone') {
          aclEntries.push({
            scopeType   : "anyone",
            name        : "Anyone",
            id          : "anyone",
            me          : true,
            requiresKey : false
          });
        }
        else if (scope.scopeType != 'user') {
          aclEntries.push({
            scopeType   : scope.scopeType,
            name        : scope.name,
            id          : scope.id,
            me          : false,
            requiresKey : scope.requiresKey,
            groupType   : scope.groupType
          });
        }
      }

      return JSON.stringify(aclEntries);
    });
  },

  post : function(ps) {
    var self = this;
    ps = update({}, ps);
    return this.getAuthCookie().addCallback(function(cookie) {
      return self.getOZData().addCallback(function(oz) {
        return (ps.file ? self.upload(ps.file, oz) : succeed(null))
          .addCallback(function(upload) {
          ps.upload = upload;
          return ((!self.is_pages && ps.scope)
            ? succeed(ps.scope) : self.getDefaultScope(oz))
            .addCallback(function(scope) {
            ps.scope = scope;
            return self._post(ps, oz);
          });
        });
      });
    });
  },

  favor : function(ps) {
    return this.post(update({reshare : true}, ps));
  },

  getReqid : function() {
    var sequence = this.sequence++;
    var now = new Date;
    var seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    return seconds + sequence * 1E5;
  },

  getToken : function(oz) {
    return 'oz:' + oz[2][0] + '.' + Date.now().toString(16) + '.' + this.sequence.toString(16);
  },

  getSnippetFromURL : function(url, oz) {
    var self = this;
    return request(this.HOME_URL + this.SNIPPET_URL + '?' + queryString({
      c      : url,
      t      : 1,
      _reqid : this.getReqid(),
      rt     : 'j'
    }), {
      sendContent : {
        at : oz[1][15]
      }
    }).addCallback(function(res) {
      var initialData = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
      var result = MochiKit.Base.evalJSON(initialData)[0];
      var data = self.getDataByKey(result, 'lpd');
      if (!data || !data[1]) return '';

      var snippet = data[2].length ? data[2] : data[3];
      return snippet[snippet.length - 1][21];
    });
  },

  createLinkSpar : function(ps) {
    if (ps.type === 'regular') {
      return JSON.stringify([]);
    }

    var isYoutube = (ps.type === 'video' && ps.itemUrl.match(this.YOUTUBE_REGEX));
    var videoUrl = '';
    var imageUrl = '//s2.googleusercontent.com/s2/favicons?domain=' + createURI(ps.pageUrl).host;
    if (isYoutube) {
      videoUrl = ps.itemUrl.replace(this.YOUTUBE_REGEX,
          'http://www.youtube.com/v/$1&hl=en&fs=1&autoplay=1');
      imageUrl = ps.itemUrl.replace(this.YOUTUBE_REGEX,
          'http://ytimg.googleusercontent.com/vi/$1/hqdefault.jpg');
    }
    if (ps.upload) {
      imageUrl = ps.upload.url;
    }

    var link = [];
    link.push(
      null, null, null,
      ps.upload ? '' : ps.item || ps.page,
      null,
      isYoutube ? [null, videoUrl, 385, 640] :
        ps.upload ? [null, ps.upload.url, ps.upload.height, ps.upload.width] : null,
      null, null, null,
      isYoutube ? [[null, ps.author || '', 'uploader']] : [],
      null, null, null, null, null,
      null, null, null, null, null, null,
      ps.body ? '&ldquo;' + getFlavor(ps, 'html') + '&rdquo;' : '',
      null, null
    );
    switch (ps.type) {
    case 'video':
      link.push([null, ps.pageUrl, null, 'application/x-shockwave-flash', 'video']);
      break;
    case 'photo':
      if (ps.upload) {
        link.push([null, ps.upload.photoPageUrl, null, ps.upload.mimeType, 'image']);
      }
      else {
        link.push([null, ps.pageUrl, null, 'text/html', 'document']);
      }
      break;
    default:
      link.push([null, ps.itemUrl || ps.pageUrl, null, 'text/html', 'document']);
    }
    link.push(
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null, null,
      [
        [null, imageUrl, null, null],
        [null, imageUrl, null, null]
      ],
      null, null, null, null, null
    );
    if (ps.upload) {
      link.push([
        [null, 'picasa', 'http://google.com/profiles/media/provider'],
        [
          null,
          queryString({
            albumid : ps.upload.albumid,
            photoid : ps.upload.photoid
          }),
          'http://google.com/profiles/media/onepick_media_id'
        ]
      ]);
    }
    else {
      link.push([
        [
          null,
          isYoutube ? 'youtube' : '',
          'http://google.com/profiles/media/provider'
        ]
      ]);
    }

    return JSON.stringify(link);
  },

  craetePhotoSpar : function(ps) {
    var mime = getImageMimeType(ps.itemUrl);
    return JSON.stringify([
      null, null, null, null, null,
      [null, ps.itemUrl],
      null, null, null,
      [],
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null,
      [
        null, ps.pageUrl, null, mime, 'photo',
        null, null, null, null, null, null, null, null, null
      ],
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null, null,
      [
        [null, ps.itemUrl, null, null],
        [null, ps.itemUrl, null, null]
      ],
      null, null, null, null, null,
      [
        [null, 'images', 'http://google.com/profiles/media/provider']
      ]
    ]);
  },

  createScopeSpar : function(ps) {
    var aclEntries = [];

    var scopes = JSON.parse(ps.scope);

    for (var i = 0, len = scopes.length ; i < len ; i++) {
      aclEntries.push({
        scope : scopes[i],
        role  : 20
      });
      aclEntries.push({
        scope : scopes[i],
        role  : 60
      });
    }

    return JSON.stringify({
      aclEntries : aclEntries
    });
  },

  _post : function(ps, oz) {
    var self = this;

    return ((!ps.upload && !ps.body && (ps.type === 'link'))
      ? this.getSnippetFromURL(ps.pageUrl, oz)
      : succeed(ps.body)).addCallback(function(snippet) {
      ps.body = snippet;

      var description = ps.description;
      if (ps.type === 'regular') {
        description = joinText([ps.item, ps.description], "\n");
      }
      if (ps.upload) {
        description = joinText([
          (ps.page) ? '*' + ps.page + '*' : '', ps.pageUrl,
          (ps.body) ? '“' + ps.body + '”' : ''], "\n");
        description = joinText([ps.description, description], "\n\n");
      }

      var spar = [];
      if (ps.reshare) {
        description = ps.description;
        spar.push(
          description,
          self.getToken(oz),
          ps.favorite.id,
          null, null, null
        );
        spar.push(JSON.stringify([]));
      }
      else {
        spar.push(
          description,
          self.getToken(oz),
          null,
          ps.upload ? ps.upload.albumid : null,
          null, null
        );

        var link = self.createLinkSpar(ps);

        if (ps.type === 'photo' && !ps.upload) {
          var photo = self.craetePhotoSpar(ps);
          spar.push(JSON.stringify([link, photo]));
        }
        else {
          spar.push(JSON.stringify([link]));
        }
      }

      spar.push(null);
      spar.push(self.createScopeSpar(ps));
      spar.push(true, [], true, true, null, [], false, false);
      if (ps.upload) {
        spar.push(null, null, oz[2][0]);
      }

      spar = JSON.stringify(spar);

      var url = self.HOME_URL + self.BASE_URL + self.POST_URL;
      return request(url + '?' + queryString({
        _reqid : self.getReqid(),
        rt     : 'j'
      }), {
        sendContent : {
          spar : spar,
          at   : oz[1][15]
        },
        headers : {
          Origin : self.HOME_URL
        }
      });
    });
  },

  openUploadSession : function(fileName, fileSize, oz) {
    var self = this;

    var data = {
      protocolVersion      : '0.8',
      createSessionRequest : {
        fields : [
          {
            external : {
              name     : 'file',
              filename : fileName + '.png',
              put      : {},
              size     : fileSize
            }
          },
          {
            inlined : {
              name        : 'batchid',
              content     : String(Date.now()),
              contentType : 'text/plain'
            }
          },
          {
            inlined : {
              name        : 'disable_asbe_notification',
              content     : 'true',
              contentType : 'text/plain'
            }
          },
          {
            inlined : {
              name        : 'streamid',
              content     : 'updates',
              contentType : 'text/plain'
            }
          },
          {
            inlined : {
              name        : 'use_upload_size_pref',
              content     : 'true',
              contentType : 'text/plain'
            }
          }
        ]
      }
    };

    if (this.is_pages) {
      data.createSessionRequest.fields.push({
        inlined : {
          name        : 'effective_id',
          content     : oz[2][0],
          contentType : 'text/plain'
        }
      });
      data.createSessionRequest.fields.push({
        inlined : {
          name        : 'owner_name',
          content     : oz[2][0],
          contentType : 'text/plain'
        }
      });
    }

    var url = this.HOME_URL + this.UPLOAD_URL;
    return request(url + '?authuser=0', {
      sendContent : JSON.stringify(data)
    }).addCallback(function(res) {
      var session = JSON.parse(res.responseText);
      if (session.sessionStatus) {
        return session;
      }
      return null;
    });
  },

  upload : function(file, oz) {
    return this.openUploadSession(file.fileName, file.length, oz).addCallback(function(session) {
      if (!session) {
        return null;
      }
      return request(session.sessionStatus.externalFieldTransfers[0].putInfo.url, {
        mode        : 'raw',
        sendContent : file
      }).addCallback(function(res) {
        var session = JSON.parse(res.responseText);
        if (session.sessionStatus) {
          return session.sessionStatus
            .additionalInfo['uploader_service.GoogleRupioAdditionalInfo']
            .completionInfo.customerSpecificInfo;
        }
        return null;
      });
    });
  },

  streams : null,

  getStreams : function() {
    return this.streams;
  },

  _getStreams : function() {
    var self = this;
    this.getOZData().addCallback(function(oz) {
      self.getInitialData(12).addCallback(function(data) {
        var circles = [];
        if (data) {
          data[0].forEach(function(circle) {
            var code, id, name, has;
            code = circle[0][0];
            id   = [oz[2][0], code].join('.');
            name = circle[1][0];
            if (code && name) {
              has = false;
              circles.forEach(function(c) {
                if (!has && c[0].id === id) {
                  has = true;
                }
              });
              if (!has) {
                circles.push([{
                  scopeType   : 'focusGroup',
                  name        : name,
                  id          : id,
                  me          : false,
                  requiresKey : false,
                  groupType   : 'p'
                }]);
              }
            }
          });
        }

        var presets = [
          [{
            scopeType   : 'focusGroup',
            name        : 'Your circles',
            id          : [oz[2][0], '1c'].join('.'),
            me          : false,
            requiresKey : false,
            groupType   : 'a'
          }],
          [{
            scopeType   : 'focusGroup',
            name        : 'Extended circles',
            id          : [oz[2][0], '1f'].join('.'),
            me          : false,
            requiresKey : false,
            groupType   : 'e'
          }],
          [{
            scopeType   : 'anyone',
            name        : 'Anyone',
            id          : 'anyone',
            me          : true,
            requiresKey : false
          }]
        ];

        self.streams = {
          presets : presets,
          circles : circles
        };
      });
    });
  },

  getPages : function() {
    var self = this;
    var url = 'https://plus.google.com/u/0/_/pages/getidentities/';
    return request(url + '?'
      + queryString({
        _reqid : this.getReqid(),
        rt     : 'j'
      })
    ).addCallback(function(res) {
      var text = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
      var json = MochiKit.Base.evalJSON(text);
      var data = self.getDataByKey(json[0], 'ope.gmir');
      var pages = [];
      if (data) {
        data[1].forEach(function(page) {
          if (page[1]) {
            pages.push({
              id   : page[30],
              name : page[4][3],
              icon : page[3]
            });
          }
        });
      }
      return pages;
    });
  }
});

Models.register({
  name       : 'Gmail',
  ICON       : 'https://mail.google.com/mail/images/favicon.ico',
  LINK       : 'https://mail.google.com/mail/',
  LOGIN_URL  : 'https://accounts.google.com/ServiceLogin?service=mail',

  HOME_URL   : 'https://mail.google.com/mail/',

  GLOBALS_REGEX : /<script\b[^>]*>\s*\bvar\s+GLOBALS\s*=\s*([[]+(?:(?:(?![\]]\s*;\s*GLOBALS\[0\]\s*=\s*GM_START_TIME\s*;)[\s\S])*)*[\]])\s*;\s*GLOBALS\[0\]\s*=\s*GM_START_TIME\s*;/i,

  check: function(ps) {
    return /regular|photo|quote|link|video/.test(ps.type);
  },

  getAuthCookie: function() {
    var self = this;
    return getCookies('.google.com', 'SSID').addCallback(function(cookies) {
      if (cookies.length) {
        return cookies[cookies.length-1].value;
      } else {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
  },

  getGmailAt : function() {
    var self = this;
    return getCookies('mail.google.com', 'GMAIL_AT').addCallback(function(cookies) {
      if (cookies.length) {
        return cookies[cookies.length-1].value;
      } else {
        return '';
      }
    });
  },

  getGLOBALS : function() {
    var self = this;
    return request(self.HOME_URL).addCallback(function(res) {
      var GLOBALS = res.responseText.match(self.GLOBALS_REGEX)[1];
      return MochiKit.Base.evalJSON(GLOBALS);
    });
  },

  post : function(ps) {
    var self = this;
    ps = update({}, ps);
    return self.getAuthCookie().addCallback(function(cookie) {
      return self.getGLOBALS().addCallback(function(GLOBALS) {
        if (ps.type === 'photo') {
          return self.download(ps).addCallback(function(file) {
            ps.file = file;
            return self._post(GLOBALS, ps);
          });
        } else {
          return self._post(GLOBALS, ps);
        }
      });
    });
  },

  now : Date.now || function() {
    return +new Date;
  },

  SEQUENCE1 : 0,

  getRid : function(GLOBALS) {
    this.SEQUENCE1 += 2;
    return "mail:sd." + GLOBALS[28] + "." + this.SEQUENCE1 + ".0";
  },

  getJsid : function() {
    return Math.floor(2147483648 * Math.random()).toString(36)
      + Math.abs(Math.floor(2147483648 * Math.random()) ^ 1).toString(36)
  },

  SEQUENCE2 : 1,

  getCmid : function() {
    return this.SEQUENCE2++;
  },

  SEQUENCE3 : 0,

  getReqid : function() {
    var now = new Date;
    this.seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    return this.seconds + (this.SEQUENCE3++) * 1E5;
  },

  SEQUENCE4 : 0,

  getFileid : function() {
    return "f_" + this.now().toString(36) + this.SEQUENCE4++;
  },

  download : function(ps) {
    var self = this;
    return (
      ps.file
        ? succeed(ps.file)
        : download(ps.itemUrl, getImageMimeType(ps.itemUrl), getFileExtension(ps.itemUrl))
          .addCallback(function(entry) {
          return getFileFromEntry(entry);
        })
    );
  },

  createContents : function(ps) {
    var description = '';
    if (ps.description) {
      description += '<p>'
        + ps.description.replace(/\n/g, '<br/>\n') + '</p>\n\n';
    }
    if (ps.page && ps.pageUrl) {
      description += '<a href="' + ps.pageUrl + '">' + ps.page + '</a>\n';
    }
    else if (ps.pageUrl) {
      description += '<a href="' + ps.pageUrl + '">' + ps.pageUrl + '</a>\n';
    }
    if (ps.body) {
      description += '<blockquote>' + ps.body + '</blockquote>';
    }
    return description;
  },

  createRecipients : function(GLOBALS) {
    var addr = GLOBALS[10].split('@');
    return '<' + addr[0] + '+taberareloo@' + addr[1] + '>, ';
  },

  _post : function(GLOBALS, ps) {
    var self = this;

    var content = self.createContents(ps);

    var sc = {
      to      : self.createRecipients(GLOBALS),
      cc      : '',
      bcc     : '',
      subject : ps.item || ps.page,
      body    : content,
      ishtml  : 1,
      nowrap  : 0,
      draft   : 'undefined',
      bwd     : '',
      rm      : 'undefined',
      cans    : '',
      ctok    : '',
      ac      : '[]',
      adc     : ''
    };

    return self.getGmailAt().addCallback(function(at) {
      var qs = {
        ui     : 2,
        ik     : GLOBALS[9],
        rid    : self.getRid(GLOBALS),
        at     : at,
        view   : 'up',
        act    : 'sm',
        jsid   : self.getJsid(),
        cmid   : self.getCmid(),
        cmeb   : 1, // 0, ???
        cmml   : content.length,
        _reqid : self.getReqid(),
        pcd    : 1,
        mb     : 0,
        rt     : 'c'
      };

      if ((ps.type === 'photo') && ps.file) {
        sc[self.getFileid()] = ps.file;
        qs['rt'] = 'h';
        qs['zx'] = self.getJsid();
      }

      return request(self.HOME_URL + '?' + queryString(qs), {
        sendContent : sc
      });
    });
  }
});

var WebHook = {
  name      : 'WebHook',
  ICON      : chrome.extension.getURL('skin/webhook.png'),
  LINK      : 'http://www.webhooks.org/',
  LOGIN_URL : null,

  POST_URL  : null,

  check : function(ps) {
    return true;
  },

  post : function(ps) {
    var self = this;
    ps = update({}, ps);
    if (ps.type === 'photo') {
      return self._download(ps).addCallback(function(file) {
        ps.file = file;
        return fileToBinaryString(file).addCallback(function(binary) {
          ps.file = window.btoa(binary);
          return self._post(ps);
        })
      });
    } else {
      return self._post(ps);
    }
  },

  _post : function(ps) {
    var self = this;

    var sendContent = {
      type  : ps.type,
      title : ps.item || ps.page,
      url   : ps.pageUrl,
      body  : ps.body,
      html  : getFlavor(ps, 'html'),
      desc  : ps.description || null,
      item  : ps.itemUrl,
      file  : ps.file || null
    };

    return request(self.POST_URL, {
      sendContent : sendContent
    });
  },

  _download : function(ps) {
    var self = this;
    return (
      ps.file
        ? succeed(ps.file)
        : download(ps.itemUrl, getImageMimeType(ps.itemUrl), getFileExtension(ps.itemUrl))
          .addCallback(function(entry) {
          return getFileFromEntry(entry);
        })
    );
  }
};

Models.register({
  name      : 'Pinterest',
  ICON      : 'http://passets-cdn.pinterest.com/images/favicon.png',
  LINK      : 'http://pinterest.com/',
  LOGIN_URL : 'https://pinterest.com/login/',

  BOOKMARK_URL : 'http://pinterest.com/pin/create/bookmarklet/',
  UPLOAD_URL   : 'http://pinterest.com/pin/create/',

  check : function(ps) {
    return (/photo/).test(ps.type);
  },

  getBoards : function(check_login) {
    var self = this;
    return request(this.BOOKMARK_URL).addCallback(function(res) {
      var doc = createHTML(res.responseText);
      if (check_login && !$X('id("id_board")/@value', doc)[0]) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      var boards = [];
      $X('//div[@class="BoardList"]/ul/li', doc).forEach(function(li) {
        boards.push({
          id   : $X('./@data', li)[0],
          name : $X('./span/text()', li)[0]
        });
      });
      return boards;
    });
  },

  getCSRFToken : function() {
    var self = this;
    return getCookies('.pinterest.com', 'csrftoken').addCallback(function(cookies) {
      if (cookies.length) {
        return cookies[cookies.length-1].value;
      } else {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
  },

  post : function(ps) {
    var self = this;

    var caption = '';
    if (ps.description || ps.body) {
      caption = joinText([
        ps.description,
        (ps.body) ? '“' + ps.body + '”' : ''
      ], "\n\n", true);
    }
    else {
      caption = ps.item || ps.page;
    }

    var sendContent = {};
    if (ps.file) {
      caption = joinText([
        caption,
        '(via ' + ps.pageUrl + ' )'
      ], "\n\n", true);
      sendContent = {
        details : caption,
        link    : ps.pageUrl,
        img_url : ps.itemUrl,
        img     : ps.file
      };
    }
    else {
      sendContent = {
        details : caption,
        link    : ps.pageUrl,
        img_url : ps.itemUrl
      };
    }

    return (ps.pinboard
      ? succeed([{id : ps.pinboard}])
      : self.getBoards(true))
    .addCallback(function(boards) {
      sendContent.board = boards[0].id;
      return self.getCSRFToken().addCallback(function(csrftoken) {
        sendContent.csrfmiddlewaretoken = csrftoken;
        return request(self.UPLOAD_URL, {
          sendContent : sendContent
        });
      });
    });
  }
});

Models.register({
  name      : 'Gyazo',
  ICON      : 'http://gyazo.com/public/img/favicon.ico',
  LINK      : 'http://gyazo.com/',
  LOGIN_URL : null,

  POST_URL  : 'http://gyazo.com/upload.cgi',

  check : function(ps) {
    return (/photo/).test(ps.type);
  },

  post : function(ps) {
    ps = update({}, ps);
    return this.upload(ps).addCallback(function(url) {
      if (url) {
        window.open(url, '');
      }
    });
  },

  upload : function(ps) {
    var self = this;
    return this._download(ps).addCallback(function(file) {
      return request(self.POST_URL, {
        sendContent : {
          id        : window.localStorage.gyazo_id || '',
          imagedata : file
        }
      }).addCallback(function(res) {
        var gyazo_id = res.getResponseHeader('X-Gyazo-Id');
        if (gyazo_id) window.localStorage.gyazo_id = gyazo_id;
        if (res.responseText && !/\.png$/.test(res.responseText)) {
          return res.responseText + '.png';
        }
        else {
          return res.responseText;
        }
      });
    });
  },

  _download : function(ps) {
    var self = this;
    return (
      !ps.itemUrl && ps.file // capture
        ? succeed(ps.file)
        : canvasRequest(ps.itemUrl).addCallback(function(data) { // must be png
          return self.base64ToFileEntry(data.binary, 'image/png', 'png');
        })
    );
  },

  base64ToFileEntry : function(base64, type, ext) {
    var cut = cutBase64Header(base64);
    var binary = window.atob(cut);
    var buffer = new ArrayBuffer(binary.length);
    var view = new Uint8Array(buffer);
    var fromCharCode = String.fromCharCode;
    for (var i = 0, len = binary.length; i < len; ++i) {
      view[i] = binary.charCodeAt(i);
    }
    return createFileEntryFromArrayBuffer(buffer, type, ext).addCallback(function(entry) {
      return getFileFromEntry(entry).addCallback(function(file) {
        return file;
      });
    });
  }
});

function shortenUrls(text, model){
  var reUrl = /https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#\^]+/g;
  if(!reUrl.test(text))
    return text;

  var urls = text.match(reUrl);
  return gatherResults(urls.map(function(url){
    return model.shorten(url);
  })).addCallback(function(ress){
    zip(urls, ress).forEach(function(pair){
      var url = pair[0], res = pair[1];
      text = text.replace(url, res);
    });

    return text;
  });
}

Models.copyTo(this);

Models.check = function(ps) {
  return this.values.filter(function(m) {
    return (ps.favorite && ps.favorite.name === (m.typeName || m.name)) || (m.check && m.check(ps));
  });
};

Models.getDefaults = function(ps) {
  var config = TBRL.Config['services'];
  return this.check(ps).filter(function(m) {
    return Models.getPostConfig(config, m.name, ps, m) === 'default';
  });
};

Models.getEnables = function(ps) {
  var config = TBRL.Config['services'];
  return this.check(ps).filter(function(m) {
    m.config = (m.config || {});

    var val = m.config[ps.type] = Models.getPostConfig(config, m.name, ps, m);
    return val === undefined || /default|enabled/.test(val);
  });
};

Models.getConfig = function(ps, poster) {
  var c  = Models.getPostConfig(TBRL.Config['services'], poster.name, ps, poster);
  if (c === 'default') {
    return 'default';
  } else if (c === undefined || 'enabled' === c) {
    return 'enabled';
  } else {
    return 'disabled';
  }
};

Models.getPostConfig = function(config, name, ps, model) {
  var c = config[name] || {};
  return (ps.favorite && ps.favorite.name === (model.typeName || name))? c.favorite : c[ps.type];
};

Models.multipleTumblelogs = [];
Models.getMultiTumblelogs = function() {
  Models.removeMultiTumblelogs();
  return Tumblr.getTumblelogs().addCallback(function(blogs) {
    return blogs.map(function(blog) {
      var model = update({}, Tumblr);
      model.name = 'Tumblr - ' + blog.name;
      model.typeName = 'Tumblr';
      addBefore(model, 'appendTags', function(form, ps){
        form.channel_id = blog.id;
      });
      Models.register(model, 'Tumblr', true);
      Models.multipleTumblelogs.push(model);
      return model;
    });
  }).addErrback(function(e) {
    alert('Multiple Tumblelog'+ ': ' +
      (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
  });
};

Models.removeMultiTumblelogs = function() {
  Models.multipleTumblelogs.forEach(function(model) {
    Models.remove(model);
  });
  Models.multipleTumblelogs = [];
};

// Google+ Pages
Models.googlePlusPages = [];
Models.getGooglePlusPages = function() {
  Models.removeGooglePlusPages();
  return Models['Google+'].getPages().addCallback(function(pages) {
    return pages.map(function(page) {
      var model = update({}, Models['Google+']);
      model.name     = 'Google+ Page - ' + page.name;
      model.ICON     = 'http:' + page.icon;
      model.typeName = 'Google+';
      model.BASE_URL = 'b/' + page.id + '/';
      model.is_pages = true;
      Models.register(model, 'Google+', true);
      Models.googlePlusPages.push(model);
      return model;
    });
  }).addErrback(function(e) {
    alert('Google+ Pages'+ ': ' +
      (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
  });
};
Models.removeGooglePlusPages = function() {
  Models.googlePlusPages.forEach(function(model) {
    Models.remove(model);
  });
  Models.googlePlusPages = [];
};

// WebHook
Models.WebHooks = [];
Models.addWebHooks = function() {
  Models.removeWebHooks();
  var webhook = update({}, WebHook);
  webhook.POST_URL = TBRL.Config['post']['webhook_url'];
  Models.register(webhook);
  Models.WebHooks.push(webhook);
};
Models.removeWebHooks = function() {
  Models.WebHooks.forEach(function(model) {
    Models.remove(model);
  });
  Models.WebHooks = [];
};

Models.initialize = function() {
  return this.values.filter(function(m) {
    return m.initialize && m.initialize();
  });
}
