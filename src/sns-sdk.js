import CookieConfig from './cookie-config'
import Parse from './parse'
import Env from './env'
import Code from './get-code.js'

export default {
  env: Env,
  debug: /(\?|#|&)debug/.test(location.href),
  code: Code,
  queue: [],
  wxAppid: 'wx2a416286e96100ed', // 微信的 appid
  qqAppid: '101204453', // QQ 的 client id
  wbAppid: '1772937595', // 微博的 client id
  snsInfo: CookieConfig.get(),

  config({ wxAppid, qqAppid, wbAppid }) {
    if (wxAppid) this.wxAppid = wxAppid
    if (qqAppid) this.qqAppid = qqAppid
    if (wbAppid) this.wbAppid = wbAppid
  },

  /**
   * @return { Boolean } sns-sdk 是否可用（使用场景是在第三方客户端中）
   */
  available() {
    if (this.env === 'browser') {
      console.warn('调用认证功能请在第三方客户端打开')
      return false
    }
    return true
  },

  /**
   * @param object { Object } 从第三方授权后拿到的信息
   */
  done() {
    let { snsInfo } = this
    if (!snsInfo.openid) {
      return this.authorize()
    }

    CookieConfig.add(snsInfo)
    this.queue.reverse()

    while (this.queue.length) {
      this.queue.pop()(snsInfo)
    }
  },

  authorize() {
    if (!this.available()) {
      return
    }
    CookieConfig.remove()

    var url = location.host === 'h5.ele.me'
      ? encodeURIComponent(location.href)
      : encodeURIComponent('https://h5.ele.me/wechat/#eleme_redirect=' + encodeURIComponent(location.href))
    const authorizeMap = {
      weixin: `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.wxAppid}&redirect_uri=${url}&response_type=code&scope=snsapi_userinfo`,
      qq: `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=${this.qqAppid}&redirect_uri=${url}&response_type=code&scope=get_user_info`,
      weibo: `https://api.weibo.com/oauth2/authorize?client_id=${this.wbAppid}&redirect_uri=${url}&display=mobile`,
    }
    location.href = authorizeMap[this.env]
  },

  /**
   * TODO: promise?
   * @param { Function } callback 拿到用户信息后的 callback 函数
   */
  getUserInfo(callback) {
    if (!this.available()) {
      return
    }

    if (this.queue.push(callback) > 1) {
      return
    }

    if (this.snsInfo.openid) {
      this.done()
    } else {
      var xhr = new XMLHttpRequest()
      xhr.open('GET', `//waltz.ele.me/${this.env}/userinfo/${this.wxAppid}?code=${encodeURIComponent(this.code)}`)
      xhr.onerror = xhr.onload = () => {
        // 兼容各方外露字段不统一
        let object = Parse(xhr.responseText)
        object.name = object.name || object.nickname
        object.openid = object.openid || object.id
        object.avatar = object.figureurl_qq_1 || object.headimgurl || object.profile_image_url
        object.eleme_key = object.eleme_key || object.key
        this.snsInfo = object
        this.done()
      }
      xhr.send()
    }
  },

  /**
   * @param { Object } param option
   * @param { String } option.title 分享标题
   * @param { String } option.desc 分享描述/简介
   * @param { String } option.imgUrl 分享的图标的绝对路径
   * @param { String } option.link 分享的链接
   */
  share(param) {
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
      'onMenuShareWeibo',
    ]
    var xhr = new XMLHttpRequest()
    xhr.open('GET', `//waltz.ele.me/weixin/jssign/${this.wxAppid}?url=${encodeURIComponent(location.href)}`)
    xhr.onload = () => {
      var data = Parse(xhr.responseText)
      var options = {
        appId: data.appid,
        timestamp: data.timestamp,
        nonceStr: data.nonceStr,
        signature: data.signature,
        jsApiList: list.slice(0),
      }

      if (this.debug) {
        options.debug = true
      }
      wx.config(options)
      wx.ready(() => {
        return list.forEach(name => {
          return wx[name](param)
        })
      })
    }
    xhr.send()
  }
}
