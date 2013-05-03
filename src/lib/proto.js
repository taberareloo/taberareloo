// -*- coding: utf-8 -*-
/*global update:true*/
(function () {
  'use strict';

  // Array extension
  Object.defineProperties(Array.prototype, {
    flatten: {
      writable: true,
      value: function () {
        var ret = [];
        (function (arr) {
          arr.forEach(function callee(e) {
            if (Array.isArray(e)) {
              callee(e);
            } else {
              ret.push(e);
            }
          });
        })(this);
        return ret;
      }
    },

    uniq : {
      writable: true,
      value: function () {
        return this.reduce(function (memo, r) {
          if (!~memo.indexOf(r)) {
            memo.push(r);
          }
          return memo;
        }, []);
      }
    },

    last : {
      writable: true,
      value: function () {
        return (this.length) ? this[this.length - 1] : undefined;
      }
    },

    first: {
      writable: true,
      value: function () {
        return (this.length) ? this[0] : undefined;
      }
    }
  });

  // Tombloo Code prototype
  Object.defineProperties(String.prototype, {
    startsWith : {
      writable: true,
      value: function (s) {
        return this.indexOf(s) === 0;
      }
    },

    pad: {
      writable: true,
      value: function (len, ch) {
        len = len - this.length;
        if (len <= 0) {
          return this;
        }
        return (ch || ' ').repeat(len) + this;
      }
    },

    indent: {
      writable: true,
      value: function (num, c) {
        c = c || ' ';
        return this.replace(/^/mg, c.repeat(num));
      }
    },

    wrap: {
      writable: true,
      value: function (c) {
        return c + this + c;
      }
    },

    repeat: {
      writable: true,
      value: function (n) {
        return new Array(n + 1).join(this);
      }
    },

    extract: {
      writable: true,
      value: function (re, group) {
        group = group == null ? 1 : group;
        var res = this.match(re);
        return res ? res[group] : '';
      }
    },

    decapitalize: {
      writable: true,
      value: function () {
        return this.substr(0, 1).toLowerCase() + this.substr(1);
      }
    },

    capitalize: {
      writable: true,
      value: function () {
        return this.substr(0, 1).toUpperCase() + this.substr(1);
      }
    },

    trimTag: {
      writable: true,
      value: function () {
        return this.replace(/<!--[\s\S]+?-->/gm, '').replace(/<[\s\S]+?>/gm, '');
      }
    },

    includesFullwidth: {
      writable: true,
      value: function () {
        return (/[^ -~｡-ﾟ]/).test(this);
      }
    },

    // http://code.google.com/p/kanaxs/
    toHiragana : {
      writable: true,
      value: function () {
        var c, i = this.length, a = [];

        while (i--) {
          c = this.charCodeAt(i);
          a[i] = (0x30A1 <= c && c <= 0x30F6) ? c - 0x0060 : c;
        }

        return String.fromCharCode.apply(null, a);
      }
    },

    toKatakana: {
      writable: true,
      value: function () {
        var c, i = this.length, a = [];

        while (i--) {
          c = this.charCodeAt(i);
          a[i] = (0x3041 <= c && c <= 0x3096) ? c + 0x0060 : c;
        }

        return String.fromCharCode.apply(null, a);
      }
    },

    toRoma: {
      writable: true,
      value: function () {
        var res = '';
        var s = this.toKatakana();
        for (var i = 0, roma, kana, table = String.katakana ; i < s.length ; i += kana.length) {
          kana = s.substr(i, 2);
          roma = table[kana];

          if (!roma) {
            kana = s.substr(i, 1);
            roma = table[kana];
          }

          if (!roma) {
            roma = kana;
          }

          res += roma;
        }
        res = res.replace(/ltu(.)/g, '$1$1');

        return res;
      }
    }
  });

  String.katakana = {
    'ウァ': 'wha',
    'ウィ': 'wi',
    'ウェ': 'we',
    'ウォ': 'who',

    'キャ': 'kya',
    'キィ': 'kyi',
    'キュ': 'kyu',
    'キェ': 'kye',
    'キョ': 'kyo',

    'クャ': 'qya',
    'クュ': 'qyu',
    'クァ': 'qwa',
    'クィ': 'qwi',
    'クゥ': 'qwu',
    'クェ': 'qwe',
    'クォ': 'qwo',

    'ギャ': 'gya',
    'ギィ': 'gyi',
    'ギュ': 'gyu',
    'ギェ': 'gye',
    'ギョ': 'gyo',

    'グァ': 'gwa',
    'グィ': 'gwi',
    'グゥ': 'gwu',
    'グェ': 'gwe',
    'グォ': 'gwo',

    'シャ': 'sha',
    'シィ': 'syi',
    'シュ': 'shu',
    'シェ': 'sye',
    'ショ': 'sho',

    'スァ': 'swa',
    'スィ': 'swi',
    'スゥ': 'swu',
    'スェ': 'swe',
    'スォ': 'swo',

    'ジャ': 'ja',
    'ジィ': 'jyi',
    'ジュ': 'ju',
    'ジェ': 'jye',
    'ジョ': 'jo',

    'チャ': 'cha',
    'チィ': 'tyi',
    'チュ': 'chu',
    'チェ': 'tye',
    'チョ': 'cho',

    'ツァ': 'tsa',
    'ツィ': 'tsi',
    'ツェ': 'tse',
    'ツォ': 'tso',

    'テャ': 'tha',
    'ティ': 'thi',
    'テュ': 'thu',
    'テェ': 'the',
    'テョ': 'tho',

    'トァ': 'twa',
    'トィ': 'twi',
    'トゥ': 'twu',
    'トェ': 'twe',
    'トォ': 'two',

    'ヂャ': 'dya',
    'ヂィ': 'dyi',
    'ヂュ': 'dyu',
    'ヂェ': 'dye',
    'ヂョ': 'dyo',

    'デャ': 'dha',
    'ディ': 'dhi',
    'デュ': 'dhu',
    'デェ': 'dhe',
    'デョ': 'dho',

    'ドァ': 'dwa',
    'ドィ': 'dwi',
    'ドゥ': 'dwu',
    'ドェ': 'dwe',
    'ドォ': 'dwo',

    'ニャ': 'nya',
    'ニィ': 'nyi',
    'ニュ': 'nyu',
    'ニェ': 'nye',
    'ニョ': 'nyo',

    'ヒャ': 'hya',
    'ヒィ': 'hyi',
    'ヒュ': 'hyu',
    'ヒェ': 'hye',
    'ヒョ': 'hyo',

    'フャ': 'fya',
    'フュ': 'fyu',
    'フョ': 'fyo',
    'ファ': 'fa',
    'フィ': 'fi',
    'フゥ': 'fwu',
    'フェ': 'fe',
    'フォ': 'fo',

    'ビャ': 'bya',
    'ビィ': 'byi',
    'ビュ': 'byu',
    'ビェ': 'bye',
    'ビョ': 'byo',

    'ヴァ': 'va',
    'ヴィ': 'vi',
    'ヴ'  : 'vu',
    'ヴェ': 've',
    'ヴォ': 'vo',

    'ヴャ': 'vya',
    'ヴュ': 'vyu',
    'ヴョ': 'vyo',

    'ピャ': 'pya',
    'ピィ': 'pyi',
    'ピュ': 'pyu',
    'ピェ': 'pye',
    'ピョ': 'pyo',

    'ミャ': 'mya',
    'ミィ': 'myi',
    'ミュ': 'myu',
    'ミェ': 'mye',
    'ミョ': 'myo',

    'リャ': 'rya',
    'リィ': 'ryi',
    'リュ': 'ryu',
    'リェ': 'rye',
    'リョ': 'ryo',

    'ア': 'a',
    'イ': 'i',
    'ウ': 'u',
    'エ': 'e',
    'オ': 'o',

    'カ': 'ka',
    'キ': 'ki',
    'ク': 'ku',
    'ケ': 'ke',
    'コ': 'ko',

    'サ': 'sa',
    'シ': 'shi',
    'ス': 'su',
    'セ': 'se',
    'ソ': 'so',

    'タ': 'ta',
    'チ': 'chi',
    'ツ': 'tsu',
    'テ': 'te',
    'ト': 'to',

    'ナ': 'na',
    'ニ': 'ni',
    'ヌ': 'nu',
    'ネ': 'ne',
    'ノ': 'no',

    'ハ': 'ha',
    'ヒ': 'hi',
    'フ': 'fu',
    'ヘ': 'he',
    'ホ': 'ho',

    'マ': 'ma',
    'ミ': 'mi',
    'ム': 'mu',
    'メ': 'me',
    'モ': 'mo',

    'ヤ': 'ya',
    'ユ': 'yu',
    'ヨ': 'yo',

    'ラ': 'ra',
    'リ': 'ri',
    'ル': 'ru',
    'レ': 're',
    'ロ': 'ro',

    'ワ': 'wa',
    'ヲ': 'wo',
    'ン': 'nn',

    'ガ': 'ga',
    'ギ': 'gi',
    'グ': 'gu',
    'ゲ': 'ge',
    'ゴ': 'go',

    'ザ': 'za',
    'ジ': 'zi',
    'ズ': 'zu',
    'ゼ': 'ze',
    'ゾ': 'zo',

    'ダ': 'da',
    'ヂ': 'di',
    'ヅ': 'du',
    'デ': 'de',
    'ド': 'do',

    'バ': 'ba',
    'ビ': 'bi',
    'ブ': 'bu',
    'ベ': 'be',
    'ボ': 'bo',

    'パ': 'pa',
    'ピ': 'pi',
    'プ': 'pu',
    'ペ': 'pe',
    'ポ': 'po',

    'ァ': 'la',
    'ィ': 'li',
    'ゥ': 'lu',
    'ェ': 'le',
    'ォ': 'lo',

    'ヵ': 'lka',
    'ヶ': 'lke',
    'ッ': 'ltu',

    'ャ': 'lya',
    'ュ': 'lyu',
    'ョ': 'lyo',
    'ヮ': 'lwa',

    '。': '.',
    '、': ',',
    'ー': '-'
  };

  update(Date, {
    TIME_SECOND : 1000,
    TIME_MINUTE : 1000 * 60,
    TIME_HOUR   : 1000 * 60 * 60,
    TIME_DAY    : 1000 * 60 * 60 * 24
  });

  Math.hypot = function (x, y) {
    return Math.sqrt(x * x + y * y);
  };

  Object.defineProperty(Number.prototype, 'toHexString', {
    writable: true,
    value: function toHexString() {
      return ('0' + this.toString(16)).slice(-2);
    }
  });
}());
/* vim: set sw=2 ts=2 et tw=80 : */
