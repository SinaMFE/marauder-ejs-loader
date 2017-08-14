const ejs = require('./ejs')
const crypto = require('crypto')
const convertedVarName = '$tplData_'
const convertMd5 = function(str) {
  const md5 = crypto.createHash('md5')
  return md5.update('str').digest('base64')
}

module.exports = function(source) {
  this.cacheable && this.cacheable()
  const loaderContext = this
  let missingFileMode = false

  run()

  function run() {
    try {
      var md5Name = convertMd5(source)
      var tmplFunc = ejs.preBuildTemplate(source)
      md5Name = convertedVarName + md5Name
    } catch (e) {
      console.error(loaderContext.request + '处理异常:' + e)
      if (missingFileMode) {
        missingFileMode = false
        return
      }
      loaderContext.callback(loaderContext.request + ':' + e)
      return
    }
    const retSource =
      'module.exports = function($TemplateData){' + tmplFunc + '} '
    // retSource = retSource.replace(new RegExp(defaultVarName, "g"), md5Name);
    loaderContext.callback(null, retSource)
  }
}
