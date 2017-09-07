(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.sns = factory());
}(this, (function () { 'use strict';

/**
 * @param { String | * } 需要被 JSON.parse() 的字符串
 * @return { Object } 被正确解析后的对象，反之返回一个空对象
 */
var Parse = function(text) {
  try {
    return JSON.parse(text) || {}
  } catch (error) {
    return {}
  }
};

var CookieConfig = {
  /**
   * @param info { String } 设置的 cookie 值
   * @param expired { String } 设置的过期时间值
   * 向当前域名的 / 路径下设置 cookie
   */
  set: function set(ref) {
    var info = ref.info;
    var expired = ref.expired;

    document.cookie = "snsInfo=" + info + "; Domain=.ele.me; Path=/; Expires=" + expired;
  },

  /**
   * @param { String } info 需要写入的 cookie 值
   */
  add: function add(info) {
    this.set({
      info: encodeURIComponent(JSON.stringify(info)),
      expired: 'Wed, 31 Dec 2098 16:00:00 GMT',
    });
  },

  get: function get() {
    return Parse(decodeURIComponent(document.cookie.match(/snsInfo=([^;]*)|$/)[1]))
  },

  remove: function remove() {
    // 清除旧的 cookie
    document.cookie = 'snsInfo=; Domain=h5.ele.me; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

    this.set({
      info: '',
      expired: 'Thu, 01 Jan 1970 00:00:00 GMT',
    });
  },
};

/**
 * @return { String } 当前环境，weixin/qq/weibo/browser 之一。用来确定如何进行授权
 */
var Env = (function() {
  var UA = navigator.userAgent;

  switch(true) {
    case /MicroMessenger/i.test(UA):
      return 'weixin'
      break
    case /QQ/i.test(UA):
      return 'qq'
      break
    case /weibo/.test(UA):
      return 'weibo'
      break
    default:
      return 'browser'
      break
  }
})();

var codes = location.href.match(/[\?|#|&]code=([^&]+)/g);
var code = '';
if (Array.isArray(codes)) {
  code = codes.pop().match(/code=(\w+)/)[1];
}

var Code = code;

var snsSdk = {
  env: Env,
  debug: /(\?|#|&)debug/.test(location.href),
  code: Code,
  queue: [],
  wxAppid: 'wx2a416286e96100ed', // 微信的 appid
  qqAppid: '101204453', // QQ 的 client id
  wbAppid: '1772937595', // 微博的 client id
  snsInfo: CookieConfig.get(),

  config: function config(ref) {
    var wxAppid = ref.wxAppid;
    var qqAppid = ref.qqAppid;
    var wbAppid = ref.wbAppid;

    if (wxAppid) { this.wxAppid = wxAppid; }
    if (qqAppid) { this.qqAppid = qqAppid; }
    if (wbAppid) { this.wbAppid = wbAppid; }
  },

  /**
   * @return { Boolean } sns-sdk 是否可用（使用场景是在第三方客户端中）
   */
  available: function available() {
    if (this.env === 'browser') {
      console.warn('调用认证功能请在第三方客户端打开');
      return false
    }
    return true
  },

  /**
   * @param object { Object } 从第三方授权后拿到的信息
   */
  done: function done() {
    var this$1 = this;

    var ref = this;
    var snsInfo = ref.snsInfo;
    if (!snsInfo.openid) {
      return this.authorize()
    }

    CookieConfig.add(snsInfo);
    this.queue.reverse();

    while (this.queue.length) {
      this$1.queue.pop()(snsInfo);
    }
  },

  authorize: function authorize() {
    if (!this.available()) {
      return
    }
    CookieConfig.remove();

    var url = location.host === 'h5.ele.me'
      ? encodeURIComponent(location.href)
      : encodeURIComponent('https://h5.ele.me/wechat/#eleme_redirect=' + encodeURIComponent(location.href));
    var authorizeMap = {
      weixin: ("https://open.weixin.qq.com/connect/oauth2/authorize?appid=" + (this.wxAppid) + "&redirect_uri=" + url + "&response_type=code&scope=snsapi_userinfo"),
      qq: ("https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=" + (this.qqAppid) + "&redirect_uri=" + url + "&response_type=code&scope=get_user_info"),
      weibo: ("https://api.weibo.com/oauth2/authorize?client_id=" + (this.wbAppid) + "&redirect_uri=" + url + "&display=mobile"),
    };
    location.href = authorizeMap[this.env];
  },

  /**
   * TODO: promise?
   * @param { Function } callback 拿到用户信息后的 callback 函数
   */
  getUserInfo: function getUserInfo(callback) {
    var this$1 = this;

    if (!this.available()) {
      return
    }

    if (this.queue.push(callback) > 1) {
      return
    }

    if (this.snsInfo.openid) {
      this.done();
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', ("//waltz.ele.me/" + (this.env) + "/userinfo/" + (this.wxAppid) + "?code=" + (encodeURIComponent(this.code))));
      xhr.onerror = xhr.onload = function () {
        // 兼容各方外露字段不统一
        var object = Parse(xhr.responseText);
        object.name = object.name || object.nickname;
        object.openid = object.openid || object.id;
        object.avatar = object.figureurl_qq_1 || object.headimgurl || object.profile_image_url;
        object.eleme_key = object.eleme_key || object.key;
        this$1.snsInfo = object;
        this$1.done();
      };
      xhr.send();
    }
  },

  /**
   * @param { Object } param option
   * @param { String } option.title 分享标题
   * @param { String } option.desc 分享描述/简介
   * @param { String } option.imgUrl 分享的图标的绝对路径
   * @param { String } option.link 分享的链接
   */
  share: function share(param) {
    var this$1 = this;

    if (!this.available()) {
      return
    }

    if (!window.wx) {
      return console.error('Uncaught ReferenceError: wx is not defined 使用分享功能需引入第三方的 sdk，请检查代码')
    }

    var list = [
      'onMenuShareTimeline',
      'onMenuShareAppMessage',
      'onMenuShareQQ',
      'onMenuShareWeibo' ];
    var xhr = new XMLHttpRequest();
    xhr.open('GET', ("//waltz.ele.me/weixin/jssign/" + (this.wxAppid) + "?url=" + (encodeURIComponent(location.href))));
    xhr.onload = function () {
      var data = Parse(xhr.responseText);
      var options = {
        appId: data.appid,
        timestamp: data.timestamp,
        nonceStr: data.nonceStr,
        signature: data.signature,
        jsApiList: list.slice(0),
      };

      if (this$1.debug) {
        options.debug = true;
      }
      wx.config(options);
      wx.ready(function () {
        return list.forEach(function (name) {
          return wx[name](param)
        })
      });
    };
    xhr.send();
  }
};

return snsSdk;

})));
