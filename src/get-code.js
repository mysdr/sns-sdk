// 取 URL 中最后一个 code 值
let codes = location.href.match(/[\?|#|&]code=([^&]+)/g)
let code = ''
if (Array.isArray(codes)) {
  code = codes.pop().match(/code=(\w+)/)[1]
}

export default code
