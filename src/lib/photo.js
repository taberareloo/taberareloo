
    {
      name : 'Photo - Flickr',
      ICON : 'http://www.flickr.com/favicon.ico',

      RE : new RegExp('^http://(?:.+?.)?static.flickr.com/\\d+?/(\\d+?)_.*'),
      getImageId : function(ctx){
        if(/flickr\.com/.test(ctx.host) && ctx.target.src.match('spaceball.gif')){
          removeElement(ctx.target);

          if(ctx.document.elementFromPoint){
            ctx.target = ctx.document.elementFromPoint(ctx.mouse.page.x, ctx.mouse.page.y);
          } else {
            ctx.target = ctx.target.previousSibling;
          }
        }

        if(!ctx.target || !ctx.target.src.match(this.RE))
          return;

        return RegExp.$1;
      },
      check : function(ctx){
        return ctx.onImage && this.getImageId(ctx);
      },
      extract : function(ctx){
        var id = this.getImageId(ctx);
        return new DeferredHash({
          'info'  : Flickr.getInfo(id),
          'sizes' : Flickr.getSizes(id)
        }).addCallback(function(r){
          if(!r.info[0])
            throw new Error(r.info[1].message);

          var info = r.info[1];
          var sizes = r.sizes[1];

          var title = info.title._content;
          ctx.title = title + ' on Flickr'
          ctx.href  = info.urls.url[0]._content;

          return {
            type      : 'photo',
            item      : title,
            itemUrl   : sizes.pop().source,
            author    : info.owner.username,
            authorUrl : ctx.href.extract(/^(http:\/\/.*?flickr\.com\/photos\/.+?\/)/),
            favorite  : {
              name : 'Flickr',
              id   : id
            }
          }
        }).addErrback(function(err){
          return Extractors['Photo'].extract(ctx);
        });
      }
    },

  {
    name : 'Photo - Google Book Search',
    ICON : models.Google.ICON,
    check : function(ctx){
      if(!(/^books.google./).test(ctx.host))
        return;

      return !!this.getImage(ctx);
    },
    extract : function(ctx){
      ctx.target = this.getImage(ctx);

      return Tombloo.Service.extractors['Photo - Upload from Cache'].extract(ctx);
    },
    getImage : function(ctx){
      // 標準モード
      var img = $x('.//img', ctx.target.parentNode);
      if(img && img.src.match('//books.google.'))
        return img;

      // HTMLモード
      var div = $x('./ancestor::div[@class="html_page_image"]', ctx.target);
      if(div){
        var img = new Image();
        img.src = getStyle(div, 'background-image').replace(/url\((.*)\)/, '$1');

        return img;
      }
    }
  },

  {
    name : 'Photo - Kiva',
    check : function(ctx){
      var imgUrl = '^http://www.kiva.org/img/';
      return (ctx.onImage && ctx.target.src.match(imgUrl)) ||
        (ctx.onLink && ctx.link.href.match(imgUrl));
    },
    extract : function(ctx){
      return getFinalUrl(ctx.onLink? ctx.link.href : ctx.target.src).addCallback(function(url){
        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : url
        }
      });
    }
  },

  {
    name : 'Photo - 4u',
    ICON : models['4u'].ICON,
    check : function(ctx){
      return ctx.onImage &&
        ctx.href.match('^http://4u.straightline.jp/image/') &&
        ctx.target.src.match('/static/upload/l/l_');
    },
    extract : function(ctx){
      var author = $x('(//div[@class="entry-information"]//a)[1]');
      var iLoveHer = $x('//div[@class="entry-item fitem"]//a/@href');
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
    name : 'Photo - We Heart It',
    ICON : models.WeHeartIt.ICON,
    check : function(ctx){
      return ctx.onImage &&
        ctx.href.match('^http://weheartit.com/entry/') &&
        ctx.target.src.match('^http://weheartit.com/images/');
    },
    extract : function(ctx){
      var author = $x('(//p[@class="hearters"]/a[@class="user"])[1]');
      return {
        type      : 'photo',
        item      : $x('id("content")//h3/text()'),
        itemUrl   : ctx.target.src,
        author    : author.textContent.trim(),
        authorUrl : author.href,
        favorite  : {
          name : 'WeHeartIt',
          id   : ctx.href.split('/').pop()
        }
      };
    }
  },

  {
    name : 'Photo - Snipshot',
    ICON : models.Snipshot.ICON,
    check : function(ctx){
      return ctx.href.match('http://services.snipshot.com/edit/');
    },
    extract : function(ctx){
      var id = ctx.window.m ? ctx.window.m.id : ctx.window.snipshot.FILE;
      var info = ctx.window.SnipshotImport;

      if(info){
        ctx.href  = info.url;
        ctx.title = info.title;
      } else {
        ctx.href  = '';
        ctx.title = '';
      }

      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : 'http://services.snipshot.com/save/'+id+'/snipshot_'+id+'.jpg'
      }
    }
  },

  {
    name : 'Photo - Fishki.Net',
    ICON : 'http://de.fishki.net/favicon.ico',
    check : function(ctx){
      return ctx.onImage &&
        ctx.target.src.match('//fishki.net/');
    },
    extract : function(ctx){
      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : ctx.target.src.replace('//fishki.net/', '//de.fishki.net/')
      }
    }
  },

  {
    name : 'Photo - Google',
    ICON : models.Google.ICON,
    check : function(ctx){
      return (ctx.onLink && ctx.link.href.match('http://lh..(google.ca|ggpht.com)/.*(png|gif|jpe?g)$'));
    },
    extract : function(ctx){
      return request(ctx.link.href).addCallback(function(res){
        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : $x('//img[1]', convertToHTMLDocument(res.responseText)).src
        }
      });
    }
  },

  {
    name : 'Photo - 1101.com/ajisha',
    ICON : 'http://www.1101.com/favicon.ico',
    check : function(ctx){
      return (ctx.onLink && ctx.link.href.match('http://www.1101.com/ajisha/p_.*.html'));
    },
    extract : function(ctx){
      return {
        type      : 'photo',
        item      : ctx.title,
        itemUrl   : ctx.link.href.replace(
          new RegExp('http://www.1101.com/ajisha/p_(.+).html'),
          'http://www.1101.com/ajisha/photo/p_$1_z.jpg')
      }
    }
  },

  {
    name : 'Photo - Picasa',
    ICON : 'http://picasaweb.google.com/favicon.ico',
    check : function(ctx){
      return (/picasaweb\.google\./).test(ctx.host) && ctx.onImage;
    },
    extract : function(ctx){
      var item = $x('//span[@class="gphoto-context-current"]/text()') || $x('//div[@class="lhcl_albumtitle"]/text()') || '';
      return {
        type      : 'photo',
        item      : item.trim(),
        itemUrl   : ctx.target.src.replace(/\?.*/, ''),
        author    : $x('id("lhid_user_nickname")/text()').trim(),
        authorUrl : $x('id("lhid_portraitlink")/@href')
      };
    }
  },

  {
    name : 'Photo - Picoolio.co.uk',
    ICON : 'chrome://tombloo/skin/item.ico',
    check : function(ctx){
      return ctx.onImage &&
        ctx.target.src.match('//picoolio.co.uk/photos/');
    },
    extract : function(ctx){
      return {
        type      : 'photo',
        item      : ctx.title,
        itemUrl   : ctx.target.src.replace(/(picoolio\.co\.uk\/photos)\/.+?\//, '$1/original/')
      }
    }
  },

  {
    name : 'Photo - webshots',
    ICON : 'http://www.webshots.com/favicon.ico',
    check : function(ctx){
      return ctx.host.match('^.+\.webshots\.com') && this.getAuthor();
    },
    extract : function(ctx){
      var author = this.getAuthor();
      return {
        type      : 'photo',
        item      : $x('//div[@class="media-info"]/h1/text()'),
        itemUrl   : $x('//li[@class="fullsize first"]/a/@href'),
        author    : author.textContent.trim(),
        authorUrl : author.href
      }
    },
    getAuthor : function(){
      return $x('(//img[@class="user-photo"])[1]/ancestor::a');
    }
  },

  {
    name : 'Photo - Blogger',
    ICON : 'https://www.blogger.com/favicon.ico',
    check : function(ctx){
      return ctx.onLink &&
        (''+ctx.link).match(/(png|gif|jpe?g)$/i) &&
        (''+ctx.link).match(/(blogger|blogspot)\.com\/.*\/s\d{2,}-h\//);
    },
    extract : function(ctx){
      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : (''+ctx.link).replace(/\/(s\d{2,})-h\//, '/$1/')
      }
    }
  },

  {
    name : 'Photo - Shorpy',
    ICON : 'http://www.shorpy.com/favicon.ico',
    check : function(ctx){
      return ctx.onImage &&
        ctx.target.src.match(/www.shorpy.com\/.*.preview\.jpg/i);
    },
    extract : function(ctx){
      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : ctx.target.src.replace('\.preview\.jpg', '.jpg')
      }
    }
  },

  {
    name : 'Photo - FFFFOUND!',
    ICON : models.FFFFOUND.ICON,
    check : function(ctx){
      return (ctx.href.match('http://ffffound.com/image/') && (/^asset/).test(ctx.target.id)) ||
        (ctx.onLink && ctx.link.href.match('http://ffffound.com/image/'));
    },
    extract : function(ctx){
      if(ctx.href.match('http://ffffound.com/image/') && (/^asset/).test(ctx.target.id)){
        var d = succeed(currentDocument());
      } else {
        var d = request(ctx.link.href).addCallback(function(res){
          // 相対パスを処理するためdocumentを渡す
          var doc = convertToHTMLDocument(res.responseText, ctx.document);

          ctx.href = ctx.link.href;
          ctx.target = $x('(//img[starts-with(@id, "asset")])', doc);

          return doc;
        })
      }

      d.addCallback(function(doc){
        var author = $x('//div[@class="saved_by"]/a[1]', doc);
        ctx.title = $x('//title/text()', doc) || '';

        var uri = createURI(ctx.href);
        ctx.href = uri.prePath + uri.filePath;

        return {
          type      : 'photo',
          item      : $x('//div[@class="title"]/a/text()', doc).trim(),
          itemUrl   : ctx.target.src.replace(/_m(\..{3})$/, '$1'),
          author    : author.textContent,
          authorUrl : author.href,
          favorite : {
            name : 'FFFFOUND',
            id   : ctx.href.split('/').pop()
          }
        }
      });

      return d;
    }
  },

  {
    name : 'Photo - Google Image Search',
    ICON : models.Google.ICON,
    check : function(ctx){
      return ctx.host === 'images.google.co.jp' &&
        ctx.onImage && ctx.onLink;
    },
    extract : function(ctx){
      var link  = $x('parent::a/@href', ctx.target);
      var itemUrl = decodeURIComponent(link.match(/imgurl=([^&]+)/)[1]);
      ctx.href = decodeURIComponent(link.match(/imgrefurl=([^&]+)/)[1]);

      return request(ctx.href).addCallback(function(res){
        ctx.title =
          res.responseText.extract(/<title.*?>([\s\S]*?)<\/title>/im).replace(/[\n\r]/g, '').trim() ||
          createURI(itemUrl).fileName;

        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : itemUrl
        }
      });
    }
  },

  {
    name : 'Photo - Frostdesign.net',
    ICON : 'http://mfrost.typepad.com/favicon.ico',
    check : function(ctx){
      return ctx.host === 'mfrost.typepad.com' && (ctx.onLink && ctx.link.href.match('http://mfrost.typepad.com/.shared/image.html'));
    },
    extract : function(ctx){
      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : 'http://mfrost.typepad.com' + ctx.link.href.split('?').pop()
      }
    }
  },

  {
    name : 'Photo - MediaWiki Thumbnail',
    ICON : 'http://www.mediawiki.org/favicon.ico',
    check : function(ctx){
      return ctx.onLink &&
        hasElementClass(ctx.document.body, 'mediawiki') &&
        /wiki\/.+:/.test(ctx.link.href) &&
        (/\.(svg|png|gif|jpe?g)$/i).test(ctx.link.href);
    },
    extract : function(ctx){
      return request(ctx.link.href).addCallback(function(res){
        // SVGの場合サムネイルを取得する
        var xpath = (/\.svg$/i).test(ctx.link.href)?
          'id("file")/a/img/@src':
          'id("file")/a/@href';

        return {
          type    : 'photo',
          item    : ctx.title,
          itemUrl : $x(xpath, convertToHTMLDocument(res.responseText))
        };
      });
    }
  },

  {
    name : 'Photo - covered',
    ICON : 'chrome://tombloo/skin/photo.png',
    check : function(ctx){
      if(!currentDocument().elementFromPoint || !ctx.onImage)
        return;

      // 1px四方の画像の上でクリックされたか?
      // FIXME: naturalHeight利用
      var img = IMG({src : ctx.target.src});
      return (img.width===1 && img.height===1);
    },
    extract : function(ctx){
      removeElement(ctx.target);

      return Tombloo.Service.extractors[ctx.bgImageURL?
        'Photo - background image' :
        'Photo - area element'].extract(ctx);
    }
  },

  {
    name : 'Photo - area element',
    ICON : 'chrome://tombloo/skin/photo.png',
    check : function(ctx){
      if(currentDocument().elementFromPoint && tagName(ctx.target)==='area')
        return true;
    },
    extract : function(ctx){
      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : currentDocument().elementFromPoint(ctx.mouse.page.x, ctx.mouse.page.y).src
      }
    }
  },

  {
    name : 'Photo - image link',
    ICON : 'chrome://tombloo/skin/photo.png',
    check : function(ctx){
      if(!ctx.onLink)
        return;

      var uri = createURI(ctx.link.href);
      return uri && (/(png|gif|jpe?g)$/i).test(uri.fileExtension);
    },
    extract : function(ctx){
      ctx.target = ctx.link;

      return Tombloo.Service.extractors['Photo'].extract(ctx);
    }
  },

  {
    name : 'Photo - Data URI',
    ICON : 'chrome://tombloo/skin/photo.png',
    check : function(ctx){
      return ctx.onImage && ctx.target.src.match(/^data:/);
    },
    extract : function(ctx){
      var source = ctx.target.src;
      var uri = IOService.newURI(source, null, null);
      var channel = IOService.newChannelFromURI(uri);
      return {
        type    : 'photo',
        item    : ctx.title,
        itemUrl : source,
        file    : channel.open()
      };
    }
  },

// VIDEO
/*
    {
      name : 'Photo - Upload from Cache',
      ICON : skin+'photo.png',
      check : function(ctx){
        return ctx.onImage;
      },
      extract : function(ctx){
        if(ctx.document.contentType.match(/^image/))
          ctx.title = ctx.href.split('/').pop();

        var target = ctx.target;
        var itemUrl = tagName(target)==='object'? target.data : target.src;

        var uri = createURI(itemUrl);
        var file = getTempDir();
        file.append(validateFileName(uri.fileName));

        return download(itemUrl, file).addCallback(function(file){
          return {
            type    : 'photo',
            item    : ctx.title,
            itemUrl : itemUrl,
            file    : file
          }
        });
      }
    },
*/
