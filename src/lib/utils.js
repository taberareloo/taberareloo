// vim: fileencoding=utf-8

// from ChromeFullFeed http://code.google.com/p/chromefullfeed/
// MIT licence
function createHTML(str) {
  // iframeは必要
  //str = str.replace(/<script(?:[ \t\r\n][^>]*)?>[\S\s]*?<\/script[ \t\r\n]*>|<\/?(?:html|script|object)(?:[ \t\r\n][^<>]*)?>/gi, ' ');
  var htmldoc = document.implementation.createHTMLDocument('CREATEDBYTABERARELOO');
  var range = document.createRange();
  range.selectNodeContents(htmldoc.body);
  htmldoc.body.appendChild(range.createContextualFragment(str));
  range.detach();
  return htmldoc;
}

function createXML(str){
  var xhr = new XMLHttpRequest();
  xhr.open("GET", str, false);
  xhr.send(null);
  return xhr.responseXML;
}

// http://gist.github.com/184276
// a little modified

// Cross Browser $X
// XPath 式中の接頭辞のない名前テストに接頭辞 prefix を追加する
// e.g. '//body[@class = "foo"]/p' -> '//prefix:body[@class = "foo"]/prefix:p'
// http://nanto.asablo.jp/blog/2008/12/11/4003371
function addDefaultPrefix(xpath, prefix) {
  var tokenPattern = /([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)\s*(::?|\()?|(".*?"|'.*?'|\d+(?:\.\d*)?|\.(?:\.|\d+)?|[\)\]])|(\/\/?|!=|[<>]=?|[\(\[|,=+-])|([@$])/g;
  var TERM = 1, OPERATOR = 2, MODIFIER = 3;
  var tokenType = OPERATOR;
  prefix += ':';
  function replacer(token, identifier, suffix, term, operator, modifier) {
    if (suffix) {
      tokenType =
        (suffix == ':' || (suffix == '::' && (identifier == 'attribute' || identifier == 'namespace')))
        ? MODIFIER : OPERATOR;
    } else if (identifier) {
      if (tokenType == OPERATOR && identifier != '*')
        token = prefix + token;
      tokenType = (tokenType == TERM) ? OPERATOR : TERM;
    } else {
      tokenType = term ? TERM : operator ? OPERATOR : MODIFIER;
    }
    return token;
  }
  return xpath.replace(tokenPattern, replacer);
}

// $X on XHTML
// @target Freifox3, Chrome3, Safari4, Opera10
// @source http://gist.github.com/184276.txt
function $X (exp, context) {
  context || (context = document);
  var _document  = context.ownerDocument || context,
  documentElement = _document.documentElement,
  isXHTML = documentElement.tagName !== 'HTML' && _document.createElement('p').tagName === 'p',
  defaultPrefix = null;
  if (isXHTML) {
    defaultPrefix = '__default__';
    exp = addDefaultPrefix(exp, defaultPrefix);
  }
  function resolver (prefix) {
    return context.lookupNamespaceURI(prefix === defaultPrefix ? null : prefix) ||
         documentElement.namespaceURI || "";
  }
  function value(node){
    if(!node) return;

    switch(node.nodeType) {
      case Node.ELEMENT_NODE:
        return node;
      case Node.ATTRIBUTE_NODE:
      case Node.TEXT_NODE:
        return node.textContent;
    }
  }

  var result = _document.evaluate(exp, context, resolver, XPathResult.ANY_TYPE, null);
  switch (result.resultType) {
    case XPathResult.STRING_TYPE : return result.stringValue;
    case XPathResult.NUMBER_TYPE : return result.numberValue;
    case XPathResult.BOOLEAN_TYPE: return result.booleanValue;
    case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
      // not ensure the order.
      var ret = [], i = null;
      while (i = result.iterateNext()) ret.push(value(i));
      return ret;
  }
}

// Ported from Tombloo
// Public License
function joinText(txts, delm, trimTag){
  if(!txts) return '';
  if(delm==null) delm = ',';
  txts = [].concat(txts).filter(operator.truth).flatten();
  return (trimTag? txts.map(methodcaller('trimTag')) : txts).join(delm);
}

function unescapeHTML(s){
  return s.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function update(t, s){
  if(s){
    Object.keys(s).forEach(function(key){
      t[key] = s[key];
    });
  }
  return t;
}

function maybeDeferred(d) {
  return typeof(d) == 'function'?
    MochiKit.Async.maybeDeferred(d) :
    (d==null || !d.addCallback)?
      succeed(d) :
      d;
}

function formContents(elm){
  if(typeof(elm) === 'string') elm = createHTML(elm);
  var form = MochiKit.DOM.formContents(elm);
  var ret = {};
  zip(form[0], form[1]).forEach(function(arr){
    var name = arr[0];
    var val = arr[1];
    if(ret[name]){
      if(ret[name] instanceof Array){
        ret[name].push(val);
      } else {
        ret[name] = [ret[name], val];
      }
    } else {
      ret[name] = val;
    }
  });
  return ret;
}

function isEmpty(obj){
  for(var i in obj)
    return false;
  return true;
}

function queryString(params, question){
  if(isEmpty(params)) return '';

  if(typeof(params)=='string') return params;

  var qeries = [];
  for(var key in params){
    var value = params[key];
    if(value==null)
      continue;
    else if(value instanceof Array)
      value.forEach(function(val){
        qeries.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
      });
    else
      qeries.push(encodeURIComponent(key) + '='+ encodeURIComponent(value));
  }
  return (question? '?' : '') + qeries.join('&');
}

function getMessage(key){
  return arguments.callee.hash[key] || key;
}

getMessage.hash = {
  'error.notLoggedin' : 'Not loggedin.'
};

// others
function $A(arr){
  return Array.prototype.slice.call(arr);
};

var $ = (function(){
  var hash = {};
  return function(id){
    return hash[id] || document.getElementById(id);
  }
})();

var $DF = function(){
  return document.createDocumentFragment();
}

function $D(elm){
  var range = document.createRange();
  range.selectNodeContents(elm);
  range.deleteContents();
  range.detach();
};

var $N = function(name, attr, childs){
  var ret = document.createElement(name);
  if(attr) for (var k in attr) if (attr.hasOwnProperty(k)) {
    ret.setAttribute(k, attr[k]);
  }
  switch(typeof childs){
    case "string":
    ret.appendChild(document.createTextNode(childs));
    break;
    case "object":
    for(var i=0, len=childs.length; i<len; i++){
      var child = childs[i];
      if(typeof child == "string"){
        ret.appendChild(document.createTextNode(child));
      } else {
        ret.appendChild(child);
      }
    }
  }
  return ret;
};

var $T = function(mes){
  return document.createTextNode(mes);
};

function DeferredHash(ds){
  var props = keys(ds);
  return new DeferredList(values(ds)).addCallback(function(results){
    var res = {};
    for (var i = 0, len=results.length; i < len; i++)
      res[props[i]] = results[i];
    return res;
  });
}


