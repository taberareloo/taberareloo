// -*- coding: utf-8 -*-

var skin = chrome.runtime.getURL('skin/');
var Models = new Repository();

var Tumblr = {
  name : 'Tumblr',
  ICON : 'http://assets.tumblr.com/images/favicon.gif',
  MEDIA_URL : 'http://media.tumblr.com/',
  TUMBLR_URL : 'http://www.tumblr.com/',
  LINK : 'https://www.tumblr.com/',
  LOGIN_URL : 'https://www.tumblr.com/login',

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
      entry = (function callee(all, contents){
        return contents.replace(/<blockquote>(([\n\r]|.)+)<\/blockquote>/gm, callee);
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
      return self.getForm(endpoint).addCallback(function postUpdate(form){
        var type;
        type = ps.type.capitalize();
        return Tumblr[type].convertToForm(ps).addCallback(function(form2){
          // merging forms
          update(form, form2);
          self.appendTags(form, ps);

          if (TBRL.Config.post.multi_tumblelogs && !Tumblr.blogs.some(function(id){ return id === form.channel_id; })) {
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', form.channel_id));
          }

          return (function () {
            if (type === 'Photo') {
              if (form['photo[]']) {
                return request(Tumblr.TUMBLR_URL + 'svc/post/upload_photo', {
                  sendContent: form
                }).addCallback(function(res){
                  var response = JSON.parse(res.response);

                  if (response.meta && response.meta.msg === 'OK' && response.meta.status === 200) {
                    delete form['photo[]'];
                    form['images[o1]'] = response.response[0].url;
                    form['post[photoset_layout]'] = '1';
                    form['post[photoset_order]'] = 'o1';

                    return request(Tumblr.TUMBLR_URL + 'svc/post/update', {
                      headers: {'Content-Type': 'application/json'},
                      sendContent: JSON.stringify(form)
                    });
                  }

                  return res;
                });
              } else {
                form['images[o1]'] = '';
                form['post[photoset_layout]'] = '1';
                form['post[photoset_order]'] = 'o1';
              }
            }

            return request(Tumblr.TUMBLR_URL + 'svc/post/update', {
              headers: {'Content-Type': 'application/json'},
              sendContent: JSON.stringify(form)
            });
          }()).addErrback(function(err){
            if (self.retry) {
              throw err;
            }

            Tumblr.form_key = Tumblr.channel_id = null;
            self.retry = true;

            return self.getForm(endpoint).addCallback(postUpdate);
          });
        });
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
    var form = {
      form_key: Tumblr.form_key,
      channel_id: Tumblr.channel_id,
      context_id: '',
      context_page: 'dashboard',
      custom_tweet: '',
      'post[date]': '',
      'post[draft_status]': '',
      'post[publish_on]': '',
      'post[slug]': '',
      'is_rich_text[one]': '0',
      'is_rich_text[three]': '0',
      'is_rich_text[two]': '0',
      'post[state]': '0',
      allow_photo_replies: '',
      send_to_fbog: TBRL.Config.entry.tumblr2facebook ? 'on' : '',
      send_to_twitter: TBRL.Config.entry.tumblr2twitter ? 'on' : ''
    };
    var that = this;

    if (form.form_key && form.channel_id) {
      return succeed(form);
    }

    if (TBRL.Config.post.multi_tumblelogs) {
      return Models.getMultiTumblelogs(true).addCallback(function(){
        form.form_key = Tumblr.form_key;
        form.channel_id = Tumblr.channel_id;

        return form;
      });
    }

    return request(url, { responseType: 'document' }).addCallback(function(res){
      var doc = res.response;
      if($X('id("logged_out_container")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));

      form.form_key = Tumblr.form_key = $X('//input[@name="form_key"]/@value', doc)[0];
      form.channel_id = Tumblr.channel_id = $X('//input[@name="t"]/@value', doc)[0];

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
    form['post[state]'] = (ps.private) ? 'private' : '0';
    if (TBRL.Config.post['post_with_queue']) {
      if (ps.type !== 'regular') {
        if (!(
          TBRL.Config.post['not_queue_reblog_post'] &&
            ps.favorite && ps.favorite.name === 'Tumblr'
        )) {
          form['post[state]'] = 2;
        }
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

    this.trimReblogInfo(form);

    return Tumblr[ps.type.capitalize()].convertToForm({
      description : ps.description
    }).addCallback(function(res) {
      items(res).forEach(function(item) {
        var name = item[0], value = item[1];
        if (!value) {
          return;
        }
        if (form[name]) {
          form[name] += '\n\n' + value;
        }
        else {
          form[name] = value;
        }
      });
      that.appendTags(form, ps);
      return that.postForm(function(){
        return request(Tumblr.TUMBLR_URL + 'svc/post/update', {
          headers: {'Content-Type': 'application/json'},
          sendContent: JSON.stringify(form)
        });
      });
    });
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
      if (self.retry) {
        self.retry = false;
      }

      var response = res.responseText;

      if (isJSON(response)) {
        var errors = JSON.parse(response).errors;
        if (errors) {
          if (Array.isArray(errors)) {
            // daily post limit
            throw new Error(errors.join(''));
          } else if (errors.type) {
            // daily photo upload limit
            throw new Error(errors.type);
          } else {
            // unexpected error
            throw new Error(JSON.stringify(errors));
          }
        }
        return null;
      }

      var doc = createHTML(response);
      if($X('id("logged_out_container")', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      } else if($X('id("posts")', doc)[0]){
        return null;
      } else if(response.match('more tomorrow')) {
        throw new Error('You\'ve exceeded your daily post limit.');
      } else {
        throw new Error(doc.getElementById('errors').textContent.trim());
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
    return request(Tumblr.TUMBLR_URL+'new/text', { responseType: 'document' }).addCallback(function(res){
      var doc = res.response;
      if($X('id("logged_out_container")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      return self.token = $X('//input[@name="form_key"]/@value', doc)[0];
    });
  },

  getTumblelogs : function(){
    var self = this;
    return request(Tumblr.LINK + 'settings', { responseType: 'document' }).addCallback(function(res){
      var doc = res.response;
      if($X('id("logged_out_container")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      Tumblr.form_key = $X('//input[@name="form_key"]/@value', doc)[0];
      Tumblr.channel_id = $X('//input[@name="t"]/@value', doc)[0];
      Tumblr.blogs = [Tumblr.channel_id];
      return Array.prototype.slice.call(doc.querySelectorAll(
        '#fixed_navigation > .vertical_tab > ' +
          'a[href^="/blog/"][href$="/settings"]:not([href^="/blog/' + Tumblr.channel_id + '/settings"])'
      )).reverse().map(function(a){
        var id = a.getAttribute('href').replace(/^\/blog\/|\/settings/g, '');
        Tumblr.blogs.push(id);

        return {
          id : id,
          name: a.textContent
        };
      });
    });
  }
};


Tumblr.Regular = {
  convertToForm : function(ps){
    return succeed({
      'post[type]' : ps.type,
      'post[one]'  : ps.item,
      'post[two]'  : joinText([getFlavor(ps, 'html'), ps.description], '\n\n')
    });
  }
};

Tumblr.Photo = {
  convertToForm : function(ps){
    // Tumblrのバグで画像がリダイレクトすると投稿できないので，予めリダイレクト先を調べておく
    return (ps.itemUrl ? getFinalUrl(ps.itemUrl) : succeed(null)).addCallback(function (finalUrl) {
      var form = {
        'post[type]'  : ps.type,
        'post[two]'   : joinText([
          (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
          ps.description], '\n\n'),
        'post[three]' : ps.pageUrl,
        MAX_FILE_SIZE: '10485760'
      };
      ps.file ? (form['photo[]'] = ps.file) : (form['photo_src[]'] = finalUrl);
      return form;
    });
  }
};

Tumblr.Video = {
  convertToForm : function(ps){
    return succeed({
      'post[type]' : ps.type,
      'post[one]'  : getFlavor(ps, 'html') || ps.itemUrl,
      'post[two]'  : joinText([
        (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
        ps.description], '\n\n'),
      MAX_FILE_SIZE: '104857600'
    });
  }
};

Tumblr.Link = {
  convertToForm : function(ps){
    if(ps.pageUrl){
      var thumb = TBRL.Config['entry']['thumbnail_template'].replace(RegExp('{url}', 'g'), ps.pageUrl);
    } else {
      var thumb = '';
    }
    return succeed({
      'post[type]'  : ps.type,
      'post[one]'   : ps.item,
      'post[two]'   : ps.itemUrl,
      'post[three]' : joinText([thumb, getFlavor(ps, 'html'), ps.description], '\n\n')
    });
  }
};

Tumblr.Conversation = {
  convertToForm : function(ps){
    return succeed({
      'post[type]' : ps.type,
      'post[one]'  : ps.item,
      'post[two]'  : joinText([getFlavor(ps, 'html'), ps.description], '\n\n')
    });
  }
};

Tumblr.Quote = {
  convertToForm : function(ps){
    return succeed({
      'post[type]' : ps.type,
      'post[one]'  : getFlavor(ps, 'html'),
      'post[two]'  : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n')
    });
  }
};

Tumblr.Audio = {
  convertToForm : function(ps){
    var res = {
      'post[type]'  : ps.type,
      'post[two]'   : joinText([(ps.item? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n'),
      MAX_FILE_SIZE: '10485760'
    };
    if(ps.itemUrl)
      res['post[three]'] = ps.itemUrl;
    return succeed(res);
  }
};

Models.register(Tumblr);

Models.register({
  name : '4u',
  ICON : skin + '4u.ico',
  LINK : 'http://4u-beautyimg.com/',
  LOGIN_URL : 'http://4u-beautyimg.com/admin/login',
  URL : 'http://4u-beautyimg.com/',

  check : function(ps){
    return ps.type === 'photo' && !ps.file;
  },

  post : function(ps){
    var self = this;
    return request(this.URL + 'power/manage/register', {
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
    return request(this.URL + 'user/manage/do_register', {
      redirectionLimit : 0,
      referrer : this.URL,
      responseType: 'document',
      queryString : {
        src : id
      }
    }).addCallback(function(res){
      var doc = res.response;
      if($X('//form[@action="' + this.URL + 'admin/login"]', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
  }
});

Models.register({
  name : 'FFFFOUND',
  ICON : 'http://ffffound.com/favicon.ico',
  LINK : 'http://ffffound.com/',
  URL  : 'http://ffffound.com/',

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
  ICON : skin + 'local.ico',

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
    queue: [],
    post : function(ps, url) {
      var that = this;
      if (!/^(?:http|data)/.test(url)) {
        return fail('ps.itemUrl is not URL');
      }

      // Now, latest version of Chromium, background and chrome url pages cannot download images.
      // So at first, we search normal http url tab in all tabs.
      // If it is found, we request download operation to this tab.
      // But if it is not found, we enqueue img url to this model, and at next Local post request,
      // we retry queue contents.
      function executor(urls) {
        function dispatch(url) {
          var anchor = document.createElement('a');
          anchor.href = url;
          anchor.dispatchEvent(new MouseEvent('click', {altKey: true}));
        }

        urls.forEach(function downloader(url) {
          if (/http|https/.test(url)) {
            dispatch(url);
          } else {
            // probably data url
            dispatch(getURLFromFile(base64ToBlob(url, 'image/png')));
          }
        });
      }

      function ok(tab) {
        var ary;
        if (that.queue.length !== 0) {
          ary = that.queue;
          that.queue = [];
          ary.push(url);
        } else {
          ary = [ url ];
        }
        var code = '(' + executor.toString() + '(' + JSON.stringify(ary) + '))';
        chrome.tabs.executeScript(tab.id, {
          code: code
        }, function() { });
      }

      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, function (tabs) {
        if (tabs.length === 0 || /^(?:chrome|https)/.test(tabs[0].url)) {
          chrome.tabs.query({
            url: 'http://*/*',
            active: true,
            highlighted: true,
            windowType: 'normal'
          }, function (tabs) {
            if (tabs.length === 0) {
              chrome.tabs.query({
                url: 'https://*/*',
                active: true,
                highlighted: true,
                windowType: 'normal'
              }, function (tabs) {
                if (tabs.length === 0) {
                  chrome.tabs.query({
                    url: 'http://*/*',
                    windowType: 'normal'
                  }, function (tabs) {
                    if (tabs.length === 0) {
                      that.queue.push(url);
                      return;
                    }
                    ok(tabs[0]);
                  });
                  return;
                }
                ok(tabs[0]);
              });
              return;
            }
            ok(tabs[0]);
          });
        } else {
          ok(tabs[0]);
        }
      });
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

Models.hatenaBlog = {
  name : 'HatenaBlog',
  ICON : 'http://hatenablog.com/images/favicon.ico',
  LINK : 'http://hatenablog.com/',
  LOGIN_URL : 'https://www.hatena.ne.jp/login',
  CONFIG_DETAIL_URL: 'http://blog.hatena.ne.jp/my/config/detail',
  ADMIN_URL: 'http://blog.hatena.ne.jp/',

  getBlogs : function(){
    var self = this;
    return Hatena.getToken().addCallback(function() {
      return request(self.ADMIN_URL, { responseType: 'document' }).addCallback(function(res){
        var doc = res.response;
        var sidebarElements = $A(doc.querySelectorAll('.sidebar-index .admin-menu-blogpath'));
        var blogBoxElements = $A(doc.querySelectorAll('.main-box .myblog-box'));
        return $A(sidebarElements).map(function(sidebarElement){
          var blogBoxElement = blogBoxElements.shift();
          return {
            url:       blogBoxElement.querySelector('.blog-host a').href,
            title:     sidebarElement.textContent.replace(/^\s*/, '').replace(/\s*$/, ''),
            admin_url: sidebarElement.querySelector('a').href,
            icon_url:  sidebarElement.querySelector('img').src
          };
        });
      });
    });
  },

  getUserName: function(){
    return Hatena.getToken().addCallback(function(set) {
      return set['name'];
    });
  },

  getApiKey : function() {
    var model = Models.hatenaBlog;
    if (model.token) {
      return succeed(model.token);
    } else {
      return Hatena.getToken().addCallback(function() {
        return request(model.CONFIG_DETAIL_URL, { responseType: 'document' }).addCallback(function(res){
          var doc = res.response;
          var tokenElement = doc.querySelector('.api-key')
          if (!tokenElement) {
            throw new Error('HatenaBlog#getToken: failed to find ApiKey');
          }
          model.token = tokenElement.textContent;
          return model.token;
        }).addErrback(function(e) {
          model.token = undefined;
          throw new Error('HatenaBlog#getToken: ' +
                (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
        });
      });
    }
  },

  check : function(ps) {
    // TODO
    return true;
  },

  post : function(ps) {
    // TODO
  }
};

Models.register({
  name : 'Pinboard',
  ICON : 'https://pinboard.in/favicon.ico',
  LINK : 'https://pinboard.in/',

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
      var content = {
        title       : ps.item,
        url         : ps.itemUrl,
        description : joinText([ps.body, ps.description], ' ', true),
        tags        : joinText(ps.tags, ' '),
      };
      if (ps.private || form.private) {
        content.private = 'on';
      }
      return request('https://pinboard.in/add', {
        sendContent : update(form, content),
      });
    });
  },

  getUserTags : function(){
    return request('https://pinboard.in/user_tag_list/').addCallback(function(res){
      var tags = JSON.parse(res.responseText.replace(/^var\s+usertags\s*=\s*(\[.+\]);$/, '$1'));
      return tags.map(function(tag){
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
  ICON : skin + 'delicious.png',
  LINK : 'https://delicious.com/',
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
    return request('http://feeds.delicious.com/v2/json/urlinfo/' + SparkMD5.hash(url)).addCallback(function(res){
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
      return this.getInfo().addCallback(function(info) {
        if (!info.is_logged_in) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
        }
        return info.logged_in_username;
      });
    }
    function extractUsername(username) {
      var matched = decodeURIComponent(username).match(/^(.*?) /);
      return (matched) ? matched[1] : null;
    }
  },

  getInfo : function(){
    return request('http://previous.delicious.com/save/quick', {method : 'POST'}).addCallback(function(res) {
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
      return request('http://previous.delicious.com/save', {
        queryString :  {
          url   : ps.itemUrl,
          title : ps.item
        },
        responseType: 'document'
      }).addCallback(function(res){
        var doc = res.response;
        return request('http://previous.delicious.com/save', {
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
  ICON : skin + 'google-bookmark.png',
  LINK : 'https://www.google.com/bookmarks/',
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
      },
      responseType: 'document'
    }).addCallback(function(res){
      var doc = res.response;
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
      },
      responseType: 'document'
    }).addCallback(function(res) {
      var doc = res.response;
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
    return request('https://www.google.com/bookmarks/mark', {
      queryString : {
        op : 'add'
      },
      responseType: 'document'
    }).addCallback(function(res){
      var doc = res.response;
      return doc.querySelectorAll('a[href^="/bookmarks/lookup?q=label:"]:not([href^="/bookmarks/lookup?q=label:%5Enone"])').reduce(function (memo, label) {
        memo.push({
          'name': label.firstChild.textContent.trim(),
          'frequency': label.firstElementChild.textContent.slice(1, -1)
        });
        return memo;
      }, []);
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
  ICON: 'https://calendar.google.com/googlecalendar/images/favicon.ico',
  LINK: 'https://www.google.com/calendar/',

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
        },
        responseType: 'document'
      }).addCallback(function(res) {
        // form.secidはクッキー内のsecidとは異なる
        var doc = res.response;
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
  name     : 'ChromeBookmark',
  ICON     : skin + 'chromium.ico',
  LINK     : 'chrome://bookmarks/',
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
  ICON     : 'https://www.evernote.com/favicon.ico',
  POST_URL : 'https://www.evernote.com/clip.action',
  LOGIN_URL: 'https://www.evernote.com/Login.action',
  LINK     : 'https://evernote.com/',

  check : function(ps){
    return /regular|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var that = this;
    ps = update({}, ps);
    var d = succeed();
    if(ps.type==='link' && !ps.body && TBRL.Config['post']['evernote_clip_fullpage']){
      // Because responseType: 'document' recognizes encoding
      d= request(ps.itemUrl, { responseType: 'document' }).addCallback(function (res) {
        var doc = res.response;
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
      },
      responseType: 'document'
    }).addCallback(function(res){
      var doc = res.response;
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
  ICON : 'https://friendfeed.com/favicon.ico',
  LINK : 'https://friendfeed.com/',
  LOGIN_URL : 'https://friendfeed.com/account/login',
  check : function(ps){
    return (/photo|quote|link|conversation|video/).test(ps.type) && !ps.file;
  },

  getToken : function(){
    var self = this;
    return request('http://friendfeed.com/share/bookmarklet/frame', { responseType: 'document' })
    .addCallback(function(res){
      var doc = res.response;
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
  ICON : 'https://twitter.com/favicon.ico',
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
      ps.itemUrl = ps.pageUrl;
      maxlen -= 23; // reserve for pic.twitter.com
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
    return (TBRL.Config['post']['always_shorten_url']
      ? shortenUrls(status, Models[self.SHORTEN_SERVICE])
      : succeed(status)
    ).addCallback(function(status) {
      var len = self.getActualLength(status);
      if (len > maxlen) {
        throw 'too many characters to post (' + (len - maxlen) + ' over)';
      }
      return status;
    });
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
    return request(this.URL + '/settings/account').addCallback(function(res) {
      var html = res.responseText;
      if (~html.indexOf('class="signin"'))
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
    var UPLOAD_URL = 'https://upload.twitter.com/i/tweet/create_with_media.iframe';
    var SIZE_LIMIT = 3145728;

    if (file.size > SIZE_LIMIT) {
      throw new Error('exceed the photo size limit (' + SIZE_LIMIT + ')');
    }
    else if (file.type === 'image/gif') {
      throw new Error('GIF is not supported');
    }

    return this.getToken().addCallback(function(token) {
      return fileToBinaryString(file).addCallback(function(binary) {
        return request(UPLOAD_URL, {
          sendContent : {
            status                  : status,
            'media_data[]'          : window.btoa(binary),
            iframe_callback         : 'window.top.swift_tweetbox_taberareloo',
            post_authenticity_token : token.authenticity_token
          },
          headers : {
            Referer : self.URL
          }
        }).addCallback(function(res) {
          var html = res.responseText;
          var json = html.extract(/window.top.swift_tweetbox_taberareloo\((\{.+\})\);/);
          json = JSON.parse(json);
        }).addErrback(function(e) {
          var res  = e.message;
          var html = res.responseText;
          var json = html.extract(/window.top.swift_tweetbox_taberareloo\((\{.+\})\);/);
          json = JSON.parse(json);
          throw new Error(json.error);
        });
      });
    });
  },

  getActualLength : function(status) {
    var ret = status.split('\n').map(function (s) {
      s = s.replace(/(https:\/\/(?:(?:[^ &),]|&amp;)+))/g, '12345678901234567890123');
      return s.replace(/(http:\/\/(?:(?:[^ &),]|&amp;)+))/g, '1234567890123456789012');
    }).join('\n');
    return ret.length;
  }
});

Models.register({
  name : 'Instapaper',
  ICON : skin + 'instapaper.png',
  LINK : 'https://www.instapaper.com/',
  POST_URL: 'http://www.instapaper.com/edit',
  LOGIN_URL : 'https://www.instapaper.com/user/login',
  check : function(ps){
    return /quote|link/.test(ps.type);
  },
  post : function(ps){
    var url = this.POST_URL;
    var self = this;
    return request(url, { responseType: 'document' }).addCallback(function(res){
      var doc = res.response;
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
  name : 'Pocket',
  ICON : 'https://getpocket.com/favicon.ico',
  LINK : 'https://getpocket.com/',
  LOGIN_URL : 'https://getpocket.com/l',
  check : function(ps){
    return /quote|link/.test(ps.type);
  },
  post : function(ps){
    var that = this;
    return request('http://getpocket.com/edit', { responseType: 'document' }).addCallback(function(res) {
      var doc = res.response;
      var form = doc.getElementsByTagName('form')[0];
      if (/login/.test(form.getAttribute('action'))) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', that.name));
      } else {
        return request('http://getpocket.com/edit_process.php', {
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
  ICON : 'http://i.yimg.jp/images/sicons/ybm16.gif',
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
  name : 'gist',
  ICON : 'https://gist.github.com/favicon.ico',
  LINK : 'https://gist.github.com/',
  LOGIN_URL : 'https://gist.github.com/login',
  URL  : 'https://gist.github.com/',
  check: function(ps){
    return /regular|quote/.test(ps.type);
  },
  post : function(ps){
    var self = this;
    return request(this.URL, { responseType: 'document' }).addCallback(function(res){
      var doc = res.response;
      var token = doc.querySelector('input[name="authenticity_token"]');
      if(!($X('descendant::div[contains(concat(" ",normalize-space(@class)," ")," header-logged-in ")]', doc)[0] && token)){
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
      form['gist[files][][content]'] = content;
      form['gist[description]'] = ps.item;
      // public
      form['gist[public]'] = '1';
      form['authenticity_token'] = token.value;
      return request(self.URL+'gists', {
        sendContent: form
      });
    });
  }
});

Models.register({
  name     : 'PickNaver',
  ICON     : skin + 'pick-naver.png',
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
  ICON: 'https://www.diigo.com/favicon.ico',
  LINK: 'https://www.diigo.com/',
  UPLOAD_URL: "http://www.diigo.com/item/save/image", // based on http://www.diigo.com/item/new/image?t=basic

  check: function(ps) {
    return /photo|quote|link|conversation|video/.test(ps.type);
  },

  post: function(ps) {
    if(ps.file) {
      return this.uploadImage(ps);
    } else {
      return this.addBookmark(ps.itemUrl, ps.item, ps.tags, joinText([ps.body, ps.description],' '),ps.private);
    }
  },

  uploadImage: function(ps) {
    return request(this.UPLOAD_URL, {
      sendContent: {
        file1       : ps.file,
        description : joinText([
          ps.description,
          '(via ' + ps.pageUrl + ' )'
        ], "\n", true),
        tags        : (ps.tags && ps.tags.length) ? joinText(ps.tags, ',') : '',
        private     : (!!ps.private ? "on" : "")
      }
    });
  },

  addBookmark: function(url, title, tags, description, priv) {
    return request('http://www.diigo.com/item/new/bookmark', { responseType: 'document' }).addCallback(function(res){
      var doc = res.response;
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
  ICON       : skin + 'googleplus.ico',
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

  YOUTUBE_REGEX : /http(?:s)?:\/\/(?:.*\.)?youtube.com\/watch\?v=([a-zA-Z0-9_-]+)[-_.!~*'()a-zA-Z0-9;\/?:@&=+\$,%#]*/g,

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

    var enable = false;
    ['regular', 'photo', 'quote', 'link', 'video', 'favorite'].forEach(function(type) {
      var config = Models.getConfig({ type: type }, self);
      if ((config === 'default') || (config === 'enabled')) {
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
      else {
        self.streams = null;
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
      hl     : 'en',
      _reqid : this.getReqid(),
      rt     : 'j'
    }), {
      sendContent : {
        key : key
      }
    }).addCallback(function(res) {
      var initialData = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
      return Sandbox.evalJSON(initialData).addCallback(function(json) {
        var data = self.getDataByKey(json[0], 'idr');
        if (!data) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        return Sandbox.evalJSON(data[1]).addCallback(function(json) {
          return json[key];
        });
      });
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
      data = JSON.parse(data[0]);

      var aclEntries = [];

      for (var i = 0, len = data['aclEntries'].length ; i < len ; i+=2) {
        var scope = data.aclEntries[i].scope;

        if (scope.scopeType === 'anyone') {
          aclEntries.push({
            scopeType   : 'presets',
            name        : 'Anyone',
            id          : 1,
            me          : true,
            requiresKey : false
          });
        }
        else {
          var id = scope.id.split('.')[1];
          if (id === '1c') {
            aclEntries.push({
              scopeType   : 'presets',
              name        : scope.name,
              id          : 3,
              me          : false,
              requiresKey : scope.requiresKey,
              groupType   : scope.groupType
            });
          }
          else if (id === '1f') {
            aclEntries.push({
              scopeType   : 'presets',
              name        : scope.name,
              id          : 4,
              me          : false,
              requiresKey : scope.requiresKey,
              groupType   : scope.groupType
            });
          }
          else if (scope.scopeType != 'user') {
            aclEntries.push({
              scopeType   : scope.scopeType,
              name        : scope.name,
              id          : id,
              me          : false,
              requiresKey : scope.requiresKey,
              groupType   : scope.groupType
            });
          }
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
    var data = [];
    data.push(url);
    data.push(false, false);
    data.push(null, null, null, null, null, null, null, null, null);
    data.push(true);
    return request(this.HOME_URL + this.SNIPPET_URL + '?' + queryString({
      hl     : 'en',
      _reqid : this.getReqid(),
      rt     : 'j'
    }), {
      sendContent : {
        'f.req' : JSON.stringify(data),
        at      : oz[1][15]
      }
    }).addCallback(function(res) {
      var initialData = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
      return Sandbox.evalJSON(initialData).addCallback(function(json) {
        var data = self.getDataByKey(json[0], 'lpd');
        return data;
      });
    });
  },

  getMediaLayout : function(ps, oz) {
    var self = this;
    var data = [];
    var info = self.createMediaInfo(ps);
    data.push(JSON.stringify([info]));
    data.push([2,null,null,null,null,null,null,null,null,null,null,null,null,[]]);
    return request(this.HOME_URL + '_/sharebox/medialayout/' + '?' + queryString({
      hl     : 'en',
      _reqid : this.getReqid(),
      rt     : 'j'
    }), {
      sendContent : {
        'f.req' : JSON.stringify(data),
        at      : oz[1][15]
      }
    }).addCallback(function(res) {
      var initialData = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
      return Sandbox.evalJSON(initialData).addCallback(function(json) {
        var data = self.getDataByKey(json[0], 't.mlr');
        return data;
      });
    });
  },

  makeSnippetPostable : function(snippet) {
    for (var i = 0, len = snippet.length ; i < len ; i++) {
      var item = snippet[i];
      if (Array.isArray(item)) {
        snippet[i] = this.makeSnippetPostable(item);
      }
      else if ((item !== null) && (typeof item === 'object')) {
        for(var key in item) {
          snippet[i][key] = this.makeSnippetPostable(item[key]);
        }
        for (var j = i ; j < 5 ; j++) {
          snippet.splice(i, 0, null);
        }
        break;
      }
    }
    return snippet;
  },

  createMediaInfo : function(ps) {
    var info = [];
    info.push(
      null, null, null,
      '',
      null,
      [null, ps.upload.url, ps.upload.height, ps.upload.width],
      null, null, null,
      [],
      null, null, null, null, null,
      null, null, null, null, null, null,
      '',
      null, null
    );
    info.push([null, ps.upload.photoPageUrl, null, ps.upload.mimeType, 'image']);
    info.push(
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null, null,
      [
        [null, ps.upload.url, null, null],
        [null, ps.upload.url, null, null]
      ],
      null, null, null, null, null
    );
    info.push([
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
    return JSON.stringify(info);
  },

  createScopeSpar : function(ps) {
    var aclEntries = [];

    var scopes = JSON.parse(ps.scope);

    if (scopes[0].scopeType === 'community') {
      return [[[null, null, null, [scopes[0].id]]]];
    }

    for (var i = 0, len = scopes.length ; i < len ; i++) {
      var scope = scopes[i];
      if (scope.scopeType == 'presets') {
        aclEntries.push([
          null, null, scope.id
        ]);
      }
      else {
        aclEntries.push([
          null, scope.id
        ]);
      }
    }

    return [aclEntries, null];
  },

  _post : function(ps, oz) {
    var self = this;
    return (
      (!ps.upload && !ps.reshare && (ps.type !== 'regular') && ps.pageUrl) ?
       this.getSnippetFromURL(ps.pageUrl, oz) :
       (ps.upload ? this.getMediaLayout(ps, oz) : succeed())
    ).addCallback(function(snippet) {

      var description = ps.description || '';
      if (ps.type === 'regular') {
        description = joinText([ps.item, ps.description], "\n");
      }
      var body = ps.body || '';
      ps.body  = null;
      if (body) {
        body = body.replace(/\r\n/g, "\n");
        body = body.replace(/\n<br(\s*\/)?>/ig, "\n");
        body = body.replace(/<br(\s*\/)?>\n/ig, "\n");
        body = body.replace(/<br(\s*\/)?>/ig, "\n");
        body = body.trimTag().trim();
        description = joinText([description, '“' + body + '”'], "\n\n");
      }
      if (ps.upload) {
        body = joinText([
          (ps.item || ps.page) ? '*' + (ps.item || ps.page) + '*' : '', ps.pageUrl,
          body ? '“' + body + '”' : ''], "\n");
        description = joinText([ps.description, body], "\n\n");
      }
      if (ps.tags && ps.tags.length) {
        var tags = ps.tags.map(function (tag) {
          return '#' + tag;
        }).join(' ');
        description = joinText([description, tags], "\n\n");
      }

      var data = [];
      if (ps.reshare) {
        data.push(
          ps.description || '',
          self.getToken(oz),
          ps.favorite.id,
          null, null, null,
          JSON.stringify([])
        );
      }
      else {
        data.push(
          description,
          self.getToken(oz),
          null,
          ps.upload ? ps.upload.albumid : null, null, null
        );
        if (ps.upload) {
          var link = self.createMediaInfo(ps);
          data.push(JSON.stringify([link]));
        }
        else {
          data.push(JSON.stringify([]));
        }
      }

      data.push(null, null);
      var scopes = JSON.parse(ps.scope);
      data.push((scopes[0].scopeType !== 'community'));
      data.push([], false, null, null, [], null, false);
      data.push(null, null);
      data.push(ps.upload ? oz[2][0] : null);
      data.push(null, null);
      data.push(null, null, null, null, null);
      data.push(false, false, !!ps.upload);
      data.push(null, null, null, null);
      if (ps.upload) {
        snippet = self.makeSnippetPostable(snippet[2][0]);
        data.push(snippet);
      }
      else {
        if (snippet) {
          var media_type;
          switch (snippet[4][0][0]) {
          case 1:
            media_type = 'link';
            break;
          case 2:
            media_type = 'video';
            break;
          default:
            media_type = 'link';
          }
          snippet = self.makeSnippetPostable(snippet[5][0]);
          if ((media_type !== 'video')) {
            var obj = snippet[5] || snippet[7];
            for (var key in obj) {
              if (ps.type === 'photo') {
                obj[key][1] = ps.itemUrl;
                if (!obj[key][5]) {
                  obj[key][5] = [];
                  obj[key][5][1] = 150;
                  obj[key][5][2] = 150;
                }
                obj[key][5][0] = ps.itemUrl;
                if (!obj[key][184]) {
                  obj[key][184] = [];
                  obj[key][184][0] = [339, 338, 336, 335, 0];
                  obj[key][184][5] = {40265033 : []};
                }

                function setImageToSnippet184(snippet184, image) {
                  snippet184[1] = image;
                  if (snippet184[5] && (typeof snippet184[5] === 'object')) {
                    for (var key in snippet184[5]) {
                      snippet184[5][key][0] = image;
                      snippet184[5][key][1] = image;

                      if (Array.isArray(snippet184[5][key][184])) {
                        setImageToSnippet184(snippet184[5][key][184], image);
                      }
                    }
                  }
                }
                setImageToSnippet184(obj[key][184], ps.itemUrl);
              }
              if (ps.type === 'quote') {
                obj[key][1] = null;
                obj[key][5] = null;
                obj[key][7] = null;
                obj[key][10] = null;
                obj[key][184] = null;
              }
              obj[key][2] = ps.item || ps.page;
              if (ps.type !== 'link') {
                obj[key][3] = ps.body ? ps.body.trimTag().trim() : null;
              }
            }
          }
          data.push(snippet);
        }
        else {
          data.push(null);
        }
      }
      data.push(null);

      if (scopes[0].scopeType === 'community') {
        data.push([[scopes[0].id, scopes[0].category]]);
      }
      else {
        data.push([]);
      }

      data.push(self.createScopeSpar(ps));

      data.push(null, null, null, null, null, null);

      var url = self.HOME_URL + self.BASE_URL + self.POST_URL;
      return request(url + '?' + queryString({
        hl     : 'en',
        _reqid : self.getReqid(),
        rt     : 'j'
      }), {
        sendContent : {
          'f.req' : JSON.stringify(data),
          at      : oz[1][15]
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
              filename : fileName,
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
              name        : 'client',
              content     : 'sharebox',
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
          },
          {
            inlined : {
              name        : 'album_abs_position',
              content     : '0',
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
    return this.openUploadSession(file.name, file.size, oz).addCallback(function(session) {
      if (!session) {
        throw new Error("Couldn't upload an image properly");
        return null;
      }
      return request(session.sessionStatus.externalFieldTransfers[0].putInfo.url, {
        mode        : 'raw',
        sendContent : file
      }).addCallback(function(res) {
        var session = JSON.parse(res.responseText);
        if (session.sessionStatus) {
          var completionInfo = session.sessionStatus
            .additionalInfo['uploader_service.GoogleRupioAdditionalInfo'].completionInfo;
          if (completionInfo && (completionInfo.status === 'SUCCESS')) {
            return completionInfo.customerSpecificInfo;
          }
        }
        throw new Error("Couldn't upload an image properly");
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
    this.getInitialData(12).addCallback(function(data) {
      var circles = [];
      if (data) {
        data[0].forEach(function(circle) {
          var code, id, name, has;
          id   = circle[0][0];
          name = circle[1][0];
          if (id && name) {
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
          scopeType   : 'presets',
          name        : 'Your circles',
          id          : 3,
          me          : false,
          requiresKey : false,
          groupType   : 'a'
        }],
        [{
          scopeType   : 'presets',
          name        : 'Extended circles',
          id          : 4,
          me          : false,
          requiresKey : false,
          groupType   : 'e'
        }],
        [{
          scopeType   : 'presets',
          name        : 'Anyone',
          id          : 1,
          me          : true,
          requiresKey : false
        }]
      ];

      self.streams = {
        presets : presets,
        circles : circles
      };
    });
  },

  getPages : function() {
    var self = this;
    return this.getInitialData(104).addCallback(function(data) {
      var pages = [];
      if (data && data[1] && data[1][1] && data[1][1][0]) {
        data[1][1][0].forEach(function(page) {
          if (page[0]) {
            pages.push({
              id   : page[0][30],
              name : page[0][4][3],
              icon : page[0][3]
            });
          }
        });
      }
      return pages;
    });
  },

  getCommunities : function() {
    var communities = localStorage.getItem('google_plus_communities');
    if (communities) {
      communities = JSON.parse(communities);
    }
    else {
      communities = [];
    }
    return communities;
  },

  setCommunities : function(communities) {
    communities.sort(function(a, b) {
      if (b[0].name > a[0].name) return -1;
      if (b[0].name < a[0].name) return 1;
      return 0;
    });
    localStorage.setItem('google_plus_communities', JSON.stringify(communities));
  },

  getCommunityCategories : function(community_id) {
    var self = this;
    return this.getOZData().addCallback(function(oz) {
      var url = self.HOME_URL + self.BASE_URL + '_/communities/readmembers';
      return request(url + '?' + queryString({
        hl     : 'en',
        _reqid : self.getReqid(),
        rt     : 'j'
      }), {
        sendContent : {
          'f.req' : JSON.stringify([community_id, [[4],[3]]]),
          at      : oz[1][15]
        }
      }).addCallback(function(res) {
        var initialData = res.responseText.substr(4).replace(/(\\n|\n)/g, '');
        return Sandbox.evalJSON(initialData).addCallback(function(json) {
          var data = self.getDataByKey(json[0], 'sq.rsmr');
          var categories = [];
          if (data && data[2] && data[2][2] && data[2][2][0]) {
            data[2][2][0].forEach(function(category) {
              categories.push({
                id   : category[0],
                name : category[1]
              });
            });
          }
          return categories;
        });
      });
    });
  },

  addCommunityCategory : function(url, title) {
    var self = this;

    var regex = url.match(/\/\/plus\.google\.com\/(?:u\/0\/)?communities\/(\d+)\/stream\/([^?]+)/);
    if (regex) {
      this.removeCommunityCategory(url, title, true);
      var communities = this.getCommunities();
      var name = title.replace(/ - Google\+$/, '');
      communities.push([{
        scopeType : 'community',
        name      : name,
        id        : regex[1],
        category  : regex[2]
      }]);
      TBRL.Notification.notify({
        title   : name,
        message : 'Added',
        timeout : 3
      });
      this.setCommunities(communities);
      return true;
    }

    regex = url.match(/\/\/plus\.google\.com\/(?:u\/0\/)?communities\/(\d+)$/);
    if (regex) {
      this.getCommunityCategories(regex[1]).addCallback(function(categories) {
        self.removeCommunityCategory(url, title, true);
        var communities = self.getCommunities();
        var name = title.replace(/ - Google\+$/, '');
        categories.forEach(function(category) {
          communities.push([{
            scopeType : 'community',
            name      : name + ' - ' + category.name,
            id        : regex[1],
            category  : category.id
          }]);
        });
        TBRL.Notification.notify({
          title   : name,
          message : 'Added all categories',
          timeout : 3
        });
        self.setCommunities(communities);
      });
      return true;
    }

    return false;
  },

  removeCommunityCategoryById : function(id, category) {
    var communities = this.getCommunities();
    var _communities = [];

    var found = false;
    communities.forEach(function(community) {
      if (community[0].id == id) {
        if (category) {
          if (community[0].category == category) {
            found = true;
          }
          else {
            _communities.push(community);
          }
        }
        else {
          found = true;
        }
      }
      else {
        _communities.push(community);
      }
    });
    this.setCommunities(_communities);
    return found;
  },

  removeCommunityCategory : function(url, title, no_nitify) {
    var regex = url.match(/\/\/plus\.google\.com\/(?:u\/0\/)?communities\/(\d+)\/stream\/([^?]+)/);
    if (regex) {
      var found = this.removeCommunityCategoryById(regex[1], regex[2]);
      if (found && !no_nitify) {
        TBRL.Notification.notify({
          title   : title.replace(/ - Google\+$/, ''),
          message : 'Removed',
          timeout : 3
        });
      }
      return found;
    }

    regex = url.match(/\/\/plus\.google\.com\/(?:u\/0\/)?communities\/(\d+)$/);
    if (regex) {
      var found = this.removeCommunityCategoryById(regex[1]);
      if (found && !no_nitify) {
        TBRL.Notification.notify({
          title   : title.replace(/ - Google\+$/, ''),
          message : 'Removed all categories',
          timeout : 3
        });
      }
      return found;
    }

    return false;
  }
});

Models.register({
  name       : 'Gmail',
  ICON       : 'https://mail.google.com/mail/images/favicon.ico',
  LINK       : 'https://mail.google.com/mail/',
  LOGIN_URL  : 'https://accounts.google.com/ServiceLogin?service=mail',

  HOME_URL   : 'https://mail.google.com/mail/',

  GLOBALS_REGEX : /<script\b[^>]*>(?:\/\/\s*<!\[CDATA\[)?\s*\bvar\s+GLOBALS\s*=\s*([[]+(?:(?:(?![\]]\s*;\s*GLOBALS\[0\]\s*=\s*GM_START_TIME\s*;)[\s\S])*)*[\]])\s*;\s*GLOBALS\[0\]\s*=\s*GM_START_TIME\s*;/i,

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
      return Sandbox.evalJSON(GLOBALS).addCallback(function(json) {
        return json;
      });
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
        : download(ps.itemUrl, getFileExtension(ps.itemUrl))
          .addCallback(function(entry) {
            return getFileFromEntry(entry);
          })
          .addErrback(function(e) {
            throw new Error('Could not get an image file.');
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
      description += '<blockquote>' + getFlavor(ps, 'html') + '</blockquote>';
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
  ICON      : skin + 'webhook.png',
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
        : download(ps.itemUrl, getFileExtension(ps.itemUrl))
          .addCallback(function(entry) {
          return getFileFromEntry(entry);
        })
    );
  }
};

Models.register({
  name      : 'Pinterest',
  ICON      : 'http://passets-cdn.pinterest.com/images/favicon.png',
  LINK      : 'http://www.pinterest.com/',
  LOGIN_URL : 'https://www.pinterest.com/login/',

  BOOKMARK_URL : 'http://www.pinterest.com/pin/create/bookmarklet/',
  UPLOAD_URL   : 'http://www.pinterest.com/pin/create/',

  is_new_api   : false,
  POST_URL_2   : 'http://www.pinterest.com/resource/PinResource/create/',
  UPLOAD_URL_2 : 'http://www.pinterest.com/upload-image/',

  timer : null,

  initialize : function() {
    var self = this;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    var enable = false;
    ['photo'].forEach(function(type) {
      var config = Models.getConfig({ type: type }, self);
      if ((config === 'default') || (config === 'enabled')) {
        enable = true;
      }
    });

    if (!enable) {
      return;
    }

    try {
      this._getBoards();
    }
    catch (e) {}

    this.timer = setTimeout(function() {
      self.initialize();
    }, 60000);
  },

  check : function(ps) {
    return (/photo/).test(ps.type);
  },

  boards : null,

  getBoards : function() {
    return this.boards;
  },

  _getBoards : function(check_login) {
    var self = this;
    return request(this.BOOKMARK_URL, { responseType: 'document' }).addCallback(function(res) {
      var doc = res.response;
      var boards = [];
      // for old UI
      $X('//div[@class="BoardList"]//ul/li', doc).forEach(function(li) {
        boards.push({
          id   : $X('./@data', li)[0],
          name : $X('./span/text()', li)[0].trim()
        });
        self.is_new_api = false;
      });
      // for new UI
      $X('//div[@class="boardPickerInner"]//ul/li[@class="boardPickerItem"]', doc).forEach(function(li) {
        boards.push({
          id   : $X('./@data-id', li)[0],
          name : $X('./text()', li).join("\n").trim()
        });
        self.is_new_api = true;
      });
      // for new bookmarklet
      function inBoards(id) {
        for (var i = 0, len = boards.length ; i < len ; i++) {
          if (boards[i].id === id) return true;
        }
        return false;
      }
      $X('//div[@class="boardPickerListItems"]/ul/li/div[@class="boardListItem"]', doc).forEach(function(li) {
        var id = $X('./@data-id', li)[0];
        if (!inBoards(id)) {
          boards.push({
            id   : id,
            name : $X('./span[contains(concat(" ",@class," ")," boardName ")]/text()', li).join("\n").trim()
          });
        }
        self.is_new_api = true;
      });
      if (check_login && !boards.length) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      return self.boards = boards;
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
    return (ps.pinboard
      ? succeed([{id : ps.pinboard}])
      : self._getBoards(true))
    .addCallback(function(boards) {
      return self.getCSRFToken().addCallback(function(csrftoken) {
        return self.is_new_api
          ? self._post_2(ps, boards[0].id, csrftoken)
          : self._post(ps, boards[0].id, csrftoken);
      });
    });
  },

  _post : function(ps, board_id, csrftoken) {
    var self = this;

    var caption = self._make_caption(ps);

    var sendContent = {};
    if (ps.file) {
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
    sendContent.board = board_id;
    sendContent.csrfmiddlewaretoken = csrftoken;

    return request(self.UPLOAD_URL, {
      sendContent : sendContent
    }).addCallback(function(res) {
      var json = JSON.parse(res.responseText);
      if (json && json.status && (json.status === 'fail')) {
        throw new Error(json.message);
      }
    });
  },

  _post_2 : function(ps, board_id, csrftoken) {
    var self = this;

    var data = {
      options : {
        board_id    : board_id,
        description : self._make_caption(ps),
        link        : ps.pageUrl,
        image_url   : ps.itemUrl,
        method      : 'bookmarklet',
        is_video    : 'false'
      },
      context : {
        app_version : 'ceac'
      }
    };

    return (ps.file
      ? self._upload(ps.file, data, csrftoken)
      : succeed(data)
    ).addCallback(function(data) {
      return request(self.POST_URL_2, {
        sendContent : {
          data : JSON.stringify(data)
        },
        headers : {
          'X-CSRFToken'      : csrftoken,
          'X-NEW-APP'        : 1,
          'X-Requested-With' : 'XMLHttpRequest'
        }
      }).addCallback(function(res) {
        var json = JSON.parse(res.responseText);
        if (json && json.error) {
          throw new Error('Could not post an image');
        }
      });
    });
  },

  _upload : function(file, data, csrftoken) {
    var self = this;
    return request(self.UPLOAD_URL_2 + '?' + queryString({
        img : file.name
      }),
      {
      sendContent : {
        img : file
      },
      headers : {
        'X-CSRFToken'      : csrftoken,
        'X-File-Name'      : file.name,
        'X-Requested-With' : 'XMLHttpRequest'
      }
    }).addCallback(function(res) {
      var json = JSON.parse(res.responseText);
      if (json && !json.success) {
        throw new Error('Could not upload an image');
      }
      data.options.link      = '';
      data.options.image_url = json.image_url;
      data.options.method    = 'uploaded';
      return data;
    });
  },

  _make_caption : function(ps) {
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

    if (caption.length > 400) { // Max length seems 500 on UI, but no limit in API
      caption = caption.substring(0, 400) + '...';
    }

    if (ps.file) {
      caption = joinText([
        caption,
        '(via ' + ps.pageUrl + ' )'
      ], "\n\n", true);
    }

    return caption;
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
    return createFileEntryFromBlob(base64ToBlob(base64, type), ext).addCallback(function(entry) {
      return getFileFromEntry(entry).addCallback(function(file) {
        return file;
      });
    });
  }
});

Models.register({
  name      : 'GimmeBar',
  ICON      : skin + 'gimmebar.png',
  LINK      : 'https://gimmebar.com/',
  LOGIN_URL : 'https://gimmebar.com/login',

  INIT_URL    : 'https://gimmebar.com/ajax/bookmarklet_data',
  POST_URL    : 'https://gimmebar.com/bookmarklet/capture',
  CHECK_URL   : 'https://gimmebar.com/ajax/content_url',
  UPLOAD_URL  : 'https://gimmebar.com/bookmarklet/upload',
  DESC_URL    : 'https://gimmebar.com/site-api-1/asset/',
  TWITTER_API : 'http://api.twitter.com/1/statuses/show.json',

  check : function(ps) {
    return /photo|quote|link/.test(ps.type);
  },

  getCSRFToken : function() {
    var self = this;
    return request(this.INIT_URL).addCallback(function(res) {
      if (res.responseText) {
        try {
          var data = JSON.parse(res.responseText);
        }
        catch (e) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        return data.csrf_token;
      }
      else {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
    });
  },

  post : function(ps) {
    var self = this;

    var sendContent = {
      source   : ps.pageUrl,
      title    : ps.item || ps.page,
      private  : 1,
      use_prev : 0
    };

    if (ps.description) {
      sendContent.description = ps.description;
    }

    switch (ps.type) {
    case 'photo':
      if (ps.file) {
        return this.upload(ps);
      }
      else {
        sendContent.url = ps.itemUrl;
      }
      break;
    case 'quote':
      var regex = ps.pageUrl.match(/\/\/twitter\.com\/.*?\/(?:status|statuses)\/(\d+)/);
      if (regex) {
        return this.post_twitter(ps, regex[1], sendContent);
      }
      sendContent.text = ps.body;
      break;
    case 'link':
      var regex = ps.pageUrl.match(/\/\/twitter\.com\/.*?\/(?:status|statuses)\/(\d+)/);
      if (regex) {
        return this.post_twitter(ps, regex[1], sendContent);
      }
      sendContent.url = ps.itemUrl;
      break;
    case 'video':
      return this.post_video(ps, sendContent);
    }

    return this.getCSRFToken().addCallback(function(csrftoken) {
      sendContent._csrf = csrftoken;
      return request(self.POST_URL, {
        sendContent : sendContent
      });
    });
  },

  post_twitter : function(ps, id, sendContent) {
    var self = this;
    return request(this.TWITTER_API + '?' + queryString({
      id                  : id,
      contributor_details : 'true'
    })).addCallback(function(res) {
      if (res.responseText) {
        var data = JSON.parse(res.responseText);
        var sitesense = {
          minURL  : 'http://twitter.com',
          data    : data,
          private : 'null',
          url     : ps.pageUrl,
          type    : 'status'
        };
        sendContent.sitesense = JSON.stringify(sitesense);
        return self.getCSRFToken().addCallback(function(csrftoken) {
          sendContent._csrf = csrftoken;
          return request(self.POST_URL, {
            sendContent : sendContent
          });
        });
      }
    });
  },

  post_video : function(ps, sendContent) {
    var self = this;
    return request(this.CHECK_URL + '?' + queryString({
      check : ps.itemUrl || ps.pageUrl
    })).addCallback(function(res) {
      if (res.responseText) {
        var data = JSON.parse(res.responseText);
        sendContent.assimilator = JSON.stringify(data[0]);
        return self.getCSRFToken().addCallback(function(csrftoken) {
          sendContent._csrf = csrftoken;
          return request(self.POST_URL, {
            sendContent : sendContent
          });
        });
      }
    }).addErrback(function(e) {
      throw new Error('Not supported a video post on this site.');
    });
  },

  upload : function(ps) {
    var self = this;

    var description = joinText([
      ps.description,
      (ps.body) ? '“' + ps.body + '”' : '',
      '(via ' + ps.pageUrl + ' )'
    ], "\n", true);

    return self.getCSRFToken().addCallback(function(csrftoken) {
      return request(self.UPLOAD_URL, {
        mode        : 'raw',
        sendContent : ps.file,
        headers : {
          'Content-Type'     : ps.file.type || 'image/png',
          'X-CSRF-Token'     : csrftoken,
          'X-Filename'       : ps.item || ps.page,
          'X-Privacy'        : 1,
          'X-Requested-With' : 'XMLHttpRequest'
        }
      }).addCallback(function(res) {
        if (res.responseText) {
          var data = JSON.parse(res.responseText);
          return request(self.DESC_URL + data.id, {
            sendContent : {
              description : description,
              _csrf       : csrftoken
            },
            headers : {
              'X-Requested-With' : 'XMLHttpRequest'
            }
          });
        }
      });
    });
  }
});

Models.register({
  name      : 'mixi',
  ICON      : 'http://mixi.jp/favicon.ico',
  LINK      : 'https://mixi.jp/',
  URL       : 'http://mixi.jp/',

  check : function(ps) {
    return /link/.test(ps.type);
  },

  post : function(ps) {
    var self = this;
    var checkKey = '5e4317cedfc5858733a2740d1f59ab4088e370a7';
    return request(
      self.URL + 'share.pl?' + queryString({
        k : checkKey,
        u : ps.pageUrl
      })
    ).addCallback(function(res) {
      if (res.responseText.indexOf('share_form') < 0) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }

      var doc       = createHTML(res.responseText);
      var postUrl   = doc.querySelector('form[name="share_form"]').getAttribute('action');
      var postKey   = doc.querySelector('input[name="post_key"]').value;
      var url       = doc.querySelector('input[name="u"]').value;
      var key       = doc.querySelector('input[name="k"]').value;
      var privacyId = doc.querySelector('input[name="selected_privacy_id"]').value;

      var sendContent = {
        post_key            : postKey,
        selected_privacy_id : privacyId,
        u                   : url,
        k                   : key,
        comment             : ps.description
      };

      if (doc.querySelector('input[name="selected_image_uri"]')) {
        var imageUrl  = doc.querySelector('input[name="selected_image_uri"]').value;
        sendContent.selected_image_uri = imageUrl;
        var imageKey  = doc.querySelector('input[name="selected_image_pkey"]').value;
        sendContent.selected_image_pkey = imageKey;
      }

      return request(self.URL + 'share.pl?mode=share', {
        method      : 'POST',
        sendContent : sendContent
      });
    });
  }
});

function shortenUrls(text, model){
  var reUrl = /https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#\^]+/g;
  if(!reUrl.test(text))
    return maybeDeferred(text);

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

Models.getConfigObject = function(config, name) {
  return config[name] || {};
};

Models.getPostConfig = function(config, name, ps, model) {
  var c = Models.getConfigObject(config, name);
  return (ps.favorite && ps.favorite.name === (model.typeName || name))? c.favorite : c[ps.type];
};

Models.multipleTumblelogs = [];
Models.getMultiTumblelogs = function(throwError) {
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
    if (throwError && !(Tumblr.form_key && Tumblr.channel_id)) {
      throw new Error(chrome.i18n.getMessage('error_notLoggedin', Tumblr.name));
    }

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
    return pages.reverse().map(function(page) {
      var model = update({}, Models['Google+']);
      model.name     = 'Google+ Page - ' + page.name;
      model.ICON     = 'http:' + page.icon;
      model.typeName = 'Google+';
      model.BASE_URL = 'b/' + page.id + '/';
      model.is_pages = true;
      Models.register(model, 'Google+', true);
      Models.googlePlusPages.unshift(model);
      return model;
    }).reverse();
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

// HatenaBlog
Models.hatenaBlogs = [];
Models.getHatenaBlogs = function() {
  Models.removeHatenaBlogs();
  return Models.hatenaBlog.getBlogs().addCallback(function(blogs) {
    return blogs.map(function(blog) {
      // blog is {url, title, admin_url, icon_url}
      var model = update({}, Models.hatenaBlog);
      model.LINK      = blog.url;
      model.name      = model.name + ' - ' + blog.title;
      model.ICON      = blog.icon_url;
      model.ADMIN_URL = blog.admin_url;
      Models.register(model);
      Models.hatenaBlogs.push(model);
      return model;
    });
  }).addErrback(function(e) {
    alert('HatenaBlog: ' +
      (e.message.hasOwnProperty('status') ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
  });
};
Models.removeHatenaBlogs = function() {
  Models.hatenaBlogs.forEach(function(model) {
    Models.remove(model);
  });
  Models.hatenaBlogs = [];
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
/* vim: set sw=2 ts=2 et tw=80 : */
