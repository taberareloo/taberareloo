// vim: fileencoding=utf-8

var Models = new Repository();

var Tumblr = {
  name : 'Tumblr',
  ICON : 'http://www.tumblr.com/images/favicon.gif',
  MEDIA_URL : 'http://media.tumblr.com/',
  TUMBLR_URL : 'http://www.tumblr.com/',

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
     return;

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
    return /regular|photo|quote|link|conversation|video/.test(ps.type);
  },

  /**
   * 新規エントリーをポストする。
   *
   * @param {Object} ps
   * @return {Deferred}
   */
  post : function(ps){
    var self = this;
    var endpoint = Tumblr.TUMBLR_URL + 'new/' + ps.type;
    return this.postForm(function(){
      return self.getForm(endpoint).addCallback(function(form){
        update(form, Tumblr[ps.type.capitalize()].convertToForm(ps));

        self.appendTags(form, ps);

        return request(endpoint, {sendContent : form});
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
    if(ps.private!=null)
      form['post[state]'] = (ps.private)? 'private' : 0;
    if(TBRL.Config.post['post_with_queue']){
      if(ps.type !== 'regular')
        form['post[state]'] = 2;
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
    items(Tumblr[ps.type.capitalize()].convertToForm({
      description : ps.description
    })).forEach(function(item){
      var name = item[0], value = item[1];
      if(!value)
        return;

      form[name] += '\n\n' + value;
    });

    this.appendTags(form, ps);

    return this.postForm(function(){
      return request(ps.favorite.endpoint, {sendContent : form})
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
      var doc = createHTML(res.responseText);
      if($X('id("account_form")', doc)[0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      } else if($X('id("posts")', doc)[0]){
        return null;
      } else {
        if(res.responseText.match('more tomorrow'))
          throw new Error('You\'ve exceeded your daily post limit.');
        else {
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
        }
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
  convertToForm : function(ps){
    var form = {
      'post[type]'  : ps.type,
      't'           : ps.item,
      'u'           : ps.pageUrl,
      'post[two]'   : joinText([
        (ps.item? ps.item.link(ps.pageUrl) : '') + (ps.author? ' (via ' + ps.author.link(ps.authorUrl) + ')' : ''),
        ps.description], '\n\n'),
      'post[three]' : ps.pageUrl
    };
    ps.file? (form['images[o1]'] = ps.file) : (form['photo_src'] = ps.itemUrl);

    return form;
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

Models.register(Tumblr);

Models.register({
  name : '4u',
  ICON : chrome.extension.getURL('skin/4u.ico'),

  URL : 'http://4u.straightline.jp/',

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
  name : 'Hatena',
  ICON : 'http://www.hatena.ne.jp/favicon.ico',

  getToken : function(){
    if(this.token){
      return succeed(this.token);
    } else {
      var self = this;
      return request('http://d.hatena.ne.jp/edit').addCallback(function(res){
        if(res.responseText.match(/\srkm\s*:\s*['"](.+?)['"]/))
          return self.token = RegExp.$1;
      });
    }
  },

  reprTags: function (tags) {
    return tags ? tags.map(function(t){
      return '[' + t + ']';
    }).join('') : '' ;
  }
});

Models.register({
  name : 'HatenaBookmark',
  ICON : 'http://b.hatena.ne.jp/favicon.ico',

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
    if(this.token && this.user){
      return succeed(this.token);
    } else {
      var self = this;
      return request(HatenaBookmark.JSON_URL).addCallback(function(res){
        var data = JSON.parse(res.responseText);
        if(!data["login"]){
          delete self['token'];
          delete self['user'];
          delete self['tags'];
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        self.token = data['rks'];
        self.user  = data['name'];
        return self.token;
      });
    }
  },

  addBookmark : function(url, title, tags, description){
    return this.getToken().addCallback(function(token){
      return request('http://b.hatena.ne.jp/bookmarklet.edit', {
        //denyRedirection: true,
        method: 'POST',
        sendContent : {
          rks     : token,
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
    var self = this;
    return this.getToken().addCallback(function(){
      return DeferredHash({
        tags: self.getUserTags(),
        data: self.getURLData(url)
      });
    }).addCallback(function(resses){
      if(!resses['tags'][0] || !resses['data'][0]){
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      var data = resses['data'][1];
      console.log('duplicated', !!data['bookmarked_data']);
      return {
        duplicated : !!data['bookmarked_data'],
        recommended : data['recommend_tags'],
        tags : resses['tags'][1]
      }
    });
  },

  getUserTags: function(){
    var self = this;
    return this.getToken().addCallback(function(){
      var user = self.user;
      var tags = self.tags;
      if(user && tags){
        return succeed(tags);
      } else {
        return request('http://b.hatena.ne.jp/'+user+'/tags.json').addCallback(function(res){
          try{
            tags = JSON.parse(res.responseText)['tags'];
          } catch(e) {
            throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
          }
          return self.tags = items(tags).map(function(pair){
            return {
              name      : pair[0],
              frequency : pair[1].count
            }
          });
        });
      }
    });
  },

  getURLData: function(url){
    var self = this;
    return request('http://b.hatena.ne.jp/my.entry', {
      queryString : {
        url  : url
      }
    }).addCallback(function(res){
      try{
        var json = JSON.parse(res.responseText);
      } catch(e) {
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
      }
      return json;
    });
  }
});

Models.register({
  name : 'Delicious',
  ICON : 'http://delicious.com/favicon.ico',

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
        return Object.keys(tags).reduce(function(memo, tag){
          if(tag){
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
    var self = this;
    var ds = {
      tags : this.getUserTags(),
      suggestions : this.getCurrentUser().addCallback(function(user){
        // ブックマークレット用画面の削除リンクを使い既ブックマークを判定する
        return request('http://delicious.com/save', {
          queryString : {
            noui : 1,
            url  : url
          }
        });
      }).addCallback(function(res){
        var doc = createHTML(res.responseText);
        if(!doc.getElementById('title'))
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

        function getTags(part){
          return $X('id("save-' + part + '-tags")//a[contains(@class, "tag-list-tag")]/text()', doc);
        }
        return {
          editPage : editPage = 'http://delicious.com/save?url=' + url,
          form : {
            item        : doc.getElementById('title').value,
            description : doc.getElementById('notes').value,
            tags        : doc.getElementById('tags').value.split(' '),
            private     : doc.getElementById('share').checked
          },
          duplicated : !!doc.getElementById('delete'),
          recommended : getTags('reco'),
          popular : getTags('pop'),
          network : getTags('net')
        }
      })
    };

    return new DeferredHash(ds).addCallback(function(ress){
      // エラーチェック
      values(ress).forEach(function(pair){
        var success = pair[0], res = pair[1];
        if(!success)
          throw res;
      });

      var res = ress.suggestions[1];
      res.tags = ress.tags[1];
      return res;
    });
  },

  getCurrentUser : function(defaultUser){
    if(defaultUser){
      return succeed(defaultUser);
    } else if(this.currentUser){
      return succeed(this.currentUser);
    } else {
      var self = this;
      return request("http://delicious.com/save").addCallback(function(res){
        var doc = createHTML(res.responseText);
        var match = res.responseText.match(/Delicious\.Config\.set\('LoggedInUsername', '([^']+)'\);/);
        if(match){
          var user = match[1];
          self.currentUser = user;
          return user;
        } else {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
      });
    }
  },

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var self = this;
    return request('http://delicious.com/post/', {
      queryString :  {
        title : ps.item,
        url   : ps.itemUrl
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      var elmForm = doc.getElementById('saveitem');
      if(!elmForm)
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      return request('http://delicious.com' + $X('id("saveitem")/@action', doc)[0], {
        //denyRedirection: true,
        sendContent : update(formContents(elmForm), {
          description : ps.item,
          jump        : 'no',
          notes       : joinText([ps.body, ps.description], ' ', true),
          tags        : ps.tags? ps.tags.join(' ') : '',
          share       : ps.private? 'no' : ''
        })
      });
    });
  }
});

Models.register({
  name : 'LivedoorClip',
  ICON : 'http://clip.livedoor.com/favicon.ico',
  POST_URL : 'http://clip.livedoor.com/clip/add',

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var self = this;
    return LivedoorClip.getToken().addCallback(function(token){
      var content = {
        rate    : ps.rate? ps.rate : '',
        title   : ps.item,
        postKey : token,
        link    : ps.itemUrl,
        tags    : ps.tags? ps.tags.join(' ') : '',
        notes   : joinText([ps.body, ps.description], ' ', true),
        public  : ps.private? 'off' : 'on'
      };
      return request(LivedoorClip.POST_URL, {
        //denyRedirection: true,
        sendContent : content,
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
  },

  getToken : function(){
    if(this.token){
      return succeed(this.token);
    } else {
      var self = this;
      return request(LivedoorClip.POST_URL, {
        queryString : {
          link : 'http://tombloo/',
          cache: Date.now()
        }
      }).addCallback(function(res){
        if(res.responseText.match(/"postkey" value="(.*)"/)){
          self.token = RegExp.$1;
          return self.token;
        } else {
          delete self['token'];
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
      });
    }
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
  ICON : Models.Google.ICON,

  check : function(ps){
    return /photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var self = this;
    return request('http://www.google.com/bookmarks/mark', {
      queryString :  {
        op : 'add'
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if(doc.getElementById('gaia_loginform'))
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      var form = $X('descendant::form[contains(concat(" ",normalize-space(@name)," ")," add_bkmk_form ")]', doc)[0];
      var fs = formContents(form);
      return request('http://www.google.com'+$X('//form[@name="add_bkmk_form"]/@action', doc)[0], {
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

  getSuggestions : function(url){
    // url に対してのrecommended tagsはない
    // duplicatedは判定不可
    var self = this;
    if(this.tags){
      return succeed({
        duplicated: false,
        recommended: [],
        tags: this.tags
      });
    } else {
      return request('http://www.google.com/bookmarks').addCallback(function(res){
        var doc = createHTML(res.responseText);
        self.tags = $X('descendant::a[starts-with(normalize-space(@id), "lbl_m_") and number(substring(normalize-space(@id), 7)) > 0]/text()', doc).map(function(tag){
          return {
            name      : tag,
            frequency : -1
          };
        });
        return {
          duplicated: false,
          recommended: [],
          tags: self.tags
        };
      });
    }
  }
});

Models.register({
  name     : 'Evernote',
  ICON     : 'http://www.evernote.com/favicon.ico',
  POST_URL : 'http://www.evernote.com/clip.action',

  check : function(ps){
    return /regular|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    var self = this;
    ps = update({}, ps);
    var d = succeed();
    if(ps.type==='link' && !ps.body && TBRL.Config['post']['evernote_clip_fullpage']){
      d = encodedRequest(ps.itemUrl).addCallback(function(res){
        var doc = createHTML(res.responseText);
        ps.body = convertToHTMLString(doc.documentElement, true);
      });
    }

    return d.addCallback(function(){
      return self.getToken();// login checkも走る
    }).addCallback(function(token){
      return request(self.POST_URL, {
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
    var self = this;
    return request(this.POST_URL, {
      sendContent: {
        format    : 'microclip',
        quicknote : 'true'
      }
    }).addCallback(function(res){
      var doc = createHTML(res.responseText);
      if($X('id("login_form")', doc)[0])
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

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
  URL  : 'http://twitter.com',
  SHORTEN_SERVICE : 'bit.ly',

  check : function(ps){
    return /regular|photo|quote|link|conversation|video/.test(ps.type) && !ps.file;
  },

  post : function(ps){
    return this.update(joinText([ps.description, (ps.body)? '"' + ps.body + '"' : '', ps.item, ps.itemUrl], ' '));
  },

  update : function(status){
    var self = this;
    return maybeDeferred((status.length < 140 && !TBRL.Config['post']['always_shorten_url'])?
      status : shortenUrls(status, Models[this.SHORTEN_SERVICE])
    ).addCallback(function(status){
      return Twitter.getToken().addCallback(function(token){
        // FIXME: 403が発生することがあったため redirectionLimit:0 を外す
        token.status = status;
        return request(self.URL + '/status/update', update({
          sendContent : token
        }));
      }).addCallback(function(res){
        var msg = res.responseText.extract(/notification.setMessage\("(.*?)"\)/);
        if(msg)
          throw unescapeHTML(msg).trimTag();
      });
    });
  },

  favor : function(ps){
    return this.addFavorite(ps.favorite.id);
  },

  getToken : function(){
    var self = this;
    return request(this.URL + '/account/settings').addCallback(function(res){
      var html = res.responseText;
      if(~html.indexOf('login'))
        throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));

      return {
        authenticity_token : html.extract(/authenticity_token.+value="(.+?)"/),
        siv                : html.extract(/logout\?siv=(.+?)"/)
      }
    });
  },

  remove : function(id){
    var self = this;
    return Twitter.getToken().addCallback(function(ps){
      ps._method = 'delete';
      return request(self.URL + '/status/destroy/' + id, {
        //denyRedirection: true,
        referrer : self.URL + '/',
        sendContent : ps
      });
    });
  },

  addFavorite : function(id){
    var self = this;
    return Twitter.getToken().addCallback(function(ps){
      return request(self.URL + '/favourings/create/' + id, {
        //denyRedirection: true,
        referrer : self.URL + '/',
        sendContent : ps
      });
    });
  },

  getRecipients : function(){
    var self = this;
    return request(this.URL + '/direct_messages/recipients_list?twttr=true').addCallback(function(res){
      return map(function(pair){
        return {id:pair[0], name:pair[1]};
      }, JSON.parse('(' + res.responseText + ')'));
    });
  }
});

Models.register({
  name : 'Instapaper',
  ICON : chrome.extension.getURL('skin/instapaper.ico'),
  POST_URL: 'http://www.instapaper.com/edit',
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

// http://developer.yahoo.co.jp/jlp/MAService/V1/parse.html
// APP_ID => Taberareloo ID
Models.register({
  name : 'Yahoo',
  APP_ID : 'KaZybVOxg67G6sNQLuSMqenqXLGGIbfVJGCWgHrPWGMlQS5BGWIgAVcueAxAByQBatwmBYewBgEs3.3y',

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
  }
});

Models.register({
  name : 'YahooBookmarks',
  ICON : 'http://bookmarks.yahoo.co.jp/favicon.ico',

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
      if(form.action === '/bookmarklet/account/login'){
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
  URL     : 'http://api.bit.ly',
  API_KEY : 'R_8d078b93e8213f98c239718ced551fad',
  USER    : 'to',
  VERSION : '2.0.1',

  shorten : function(url){
    var self = this;
    if(/\/\/(?:bit\.ly|j\.mp)/.test(url))
      return succeed(url);

    return this.callMethod('shorten', {
      longUrl : url
    }).addCallback(function(res){
      return res[url].shortUrl;
    });
  },

  expand : function(url){
    var hash = url.split('/').pop();
    return this.callMethod('expand', {
      hash : hash
    }).addCallback(function(res){
      return res[hash].longUrl;
    });
  },

  callMethod : function(method, ps){
    var self = this;
    return request(this.URL + '/' + method, {
      queryString : update({
        version : this.VERSION,
        login   : this.USER,
        apiKey  : this.API_KEY
      }, ps)
    }).addCallback(function(res){
      res = JSON.parse('(' + res.responseText + ')');
      if(res.errorCode){
        var error = new Error([res.statusCode, res.errorCode, res.errorMessage].join(': '))
        error.detail = res;
        throw error;
      }

      return res.results;
    });
  }
});

Models.register(update({}, Models['bit.ly'], {
  name: 'j.mp',
  ICON: 'http://j.mp/static/images/favicon.png',
  URL : 'http://api.j.mp'
}));

function shortenUrls(text, model){
  var reUrl = /https?[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#\^]+/g;
  if(!reUrl.test(text))
    return;

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

Models.check = function(ps){
  return this.values.filter(function(m){
    if((ps.favorite && ps.favorite.name === m.name) || (m.check && m.check(ps)))
      return true;
  });
}

Models.getDefaults = function(ps){
  var config = TBRL.Config['services'];
  return this.check(ps).filter(function(m){
    return Models.getPostConfig(config, m.name, ps) === 'default';
  });
}

Models.getEnables = function(ps){
  var config = TBRL.Config['services'];
  return this.check(ps).filter(function(m){
    m.config = (m.config || {});

    var val = m.config[ps.type] = Models.getPostConfig(config, m.name, ps);
    return val === undefined || /default|enabled/.test(val);
  });
}

Models.getConfig = function(ps, poster){
  var c  = Models.getPostConfig(TBRL.Config['services'], poster.name, ps);
  if(c === 'default'){
    return 'default';
  } else if(c === undefined || 'enabled' === c){
    return 'enabled';
  } else {
    return 'disabled';
  }
}

Models.getPostConfig = function(config, name, ps){
  var c = config[name] || {};
  return (ps.favorite && ps.favorite.name === name)? c.favorite : c[ps.type];
}

Models.multipleTumblelogs = [];
Models.getMultiTumblelogs = function(){
  Models.removeMultiTumblelogs();
  return Tumblr.getTumblelogs().addCallback(function(blogs){
    return blogs.map(function(blog){
      var model = update({}, Tumblr);
      model.name = 'Tumblr - ' + blog.name;
      addBefore(model, 'appendTags', function(form, ps){
        form.channel_id = blog.id;
      });
      Models.register(model, 'Tumblr', true);
      Models.multipleTumblelogs.push(model);
      return model;
    });
  }).addErrback(function(e){
    alert('Multiple Tumblelog'+ ': ' +
      (e.message.status ? '\n' + ('HTTP Status Code ' + e.message.status).indent(4) : '\n' + e.message.indent(4)));
  });
}
Models.removeMultiTumblelogs = function(){
  Models.multipleTumblelogs.forEach(function(model){
    Models.remove(model);
  });
  Models.multipleTumblelogs = [];
}
