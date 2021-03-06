/*
 * EJS Embedded JavaScript templates
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */


/**
 * @file Embedded JavaScript templating engine.
 * @author Matthew Eernisse <mde@fleegix.org>
 * @author Tiancheng "Timothy" Gu <timothygu99@gmail.com>
 * @project EJS
 * @license {@link http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2.0}
 */

/**
 * EJS internal functions.
 *
 * Technically this "module" lies in the same file as {@link module:ejs}, for
 * the sake of organization all the private functions re grouped into this
 * module.
 *
 * @module ejs-internal
 * @private
 */

/**
 * Embedded JavaScript templating engine.
 *
 * @module ejs
 * @public
 */

var fs = require('fs');
var pwd = process.cwd();

var path = require('path'),
    utils = require('./utils'),
    scopeOptionWarned = false,
    _DEFAULT_DELIMITER = '%',
    _DEFAULT_LOCALS_NAME = 'locals',
    _REGEX_STRING = '(<%%|<%=|<%-|<%_|<%#|<%|%>|-%>|_%>)',
    _OPTS = ['cache', 'filename', 'delimiter', 'scope', 'context', 'debug', 'compileDebug', 'client', '_with', 'rmWhitespace'],
    _TRAILING_SEMCOL = /;\s*$/,
    _BOM = /^\uFEFF/;
var Component = require('./component').Component
var Comp = require('./component');

var log4js = require("log4js");
log4js.configure({
    appenders: [
        { type: 'console' },
        {
            type: 'file',
            filename: path.resolve(pwd, "build.log"),
            category: 'file'
        }
    ]
});
var loggerbuild = log4js.getLogger("file");
var log = utils.log;
utils.log.setLevel('INFO');
/**
 * EJS template function cache. This can be a LRU object from lru-cache NPM
 * module. By default, it is {@link module:utils.cache}, a simple in-process
 * cache that grows continuously.
 *
 * @type {Cache}
 */

exports.cache = utils.cache;

/**
 * Name of the object containing the locals.
 *
 * This variable is overriden by {@link Options}`.localsName` if it is not
 * `undefined`.
 *
 * @type {String}
 * @public
 */

exports.localsName = _DEFAULT_LOCALS_NAME;

/**
 * Get the path to the included file from the parent file path and the
 * specified path.
 *
 * @param {String} name     specified path
 * @param {String} filename parent file path
 * @return {String}
 */

exports.resolveInclude = function(name, filename) {
    log.debug(filename);
    var path = require('path'),
        dirname = path.dirname,
        extname = path.extname,
        resolve = path.resolve,
        includePath = resolve(dirname(filename), name),
        ext = extname(name);
    if (!ext) {
        includePath += '.ejs';
    }
    return includePath;
};

/**
 * Get the template from a string or a file, either compiled on-the-fly or
 * read from cache (if enabled), and cache the template if needed.
 *
 * If `template` is not set, the file specified in `options.filename` will be
 * read.
 *
 * If `options.cache` is true, this function reads the file from
 * `options.filename` so it must be set prior to calling this function.
 *
 * @memberof module:ejs-internal
 * @param {Options} options   compilation options
 * @param {String} [template] template source
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `options.client`, either type might be returned.
 * @static
 */

exports.handleCache = function(options, template) {
    var fn, path = options.filename,
        hasTemplate = arguments.length > 1;
    log.debug(path);

    if (options.cache) {
        if (!path) {
            throw new Error('cache option requires a filename');
        }
        fn = exports.cache.get(path);
        if (fn) {
            return fn;
        }
        if (!hasTemplate) {
            template = fs.readFileSync(path).toString().replace(_BOM, '');
        }
    } else if (!hasTemplate) {
        // istanbul ignore if: should not happen at all
        if (!path) {
            throw new Error('Internal EJS error: no file name or template ' +
                'provided');
        }
        template = fs.readFileSync(path).toString().replace(_BOM, '');
    }
    fn = exports.compile(template, options);
    if (options.cache) {
        exports.cache.set(path, fn);
    }
    return fn;
}

/**
 * Get the template function.
 *
 * If `options.cache` is `true`, then the template is cached.
 *
 * @memberof module:ejs-internal
 * @param {String}  path    path for the specified file
 * @param {Options} options compilation options
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `options.client`, either type might be returned
 * @static
 */

function includeFile(path, options) {
    var opts = utils.shallowCopy({}, options);
    if (!opts.filename) {
        throw new Error('`include` requires the \'filename\' option.');
    }
    opts.filename = exports.resolveInclude(path, opts.filename);
    return handleCache(opts);
}

/**
 * Get the JavaScript source of an included file.
 *
 * @memberof module:ejs-internal
 * @param {String}  path    path for the specified file
 * @param {Options} options compilation options
 * @return {String}
 * @static
 */

function includeSource(path, options) {
    var opts = utils.shallowCopy({}, options),
        includePath, template;
    if (!opts.filename) {
        throw new Error('`include` requires the \'filename\' option.');
    }
    includePath = exports.resolveInclude(path, opts.filename);
    try {
        template = fs.readFileSync(includePath).toString().replace(_BOM, '');
    } catch (ex) {
        log.debug('处理css样式时路径' + includePath + "出错");
        throw error('处理css样式时路径' + includePath + "出错");
    }


    opts.filename = includePath;
    var templ = new Template(template, opts);
    templ.generateSource();

    return templ.source;
}


function includeCompileSource(path, options, data) {
    var opts = utils.shallowCopy({}, options),
        includePath, template;
    if (!opts.filename) {
        throw new Error('`include` requires the \'filename\' option.');
    }
    includePath = exports.resolveInclude(path, opts.filename);
    template = fs.readFileSync(includePath).toString().replace(_BOM, '');

    opts.filename = includePath;
    var templ = new Template(template, opts);
    templ.generateSource();
    return templ.source;
}


/**
 * Re-throw the given `err` in context to the `str` of ejs, `filename`, and
 * `lineno`.
 *
 * @implements RethrowCallback
 * @memberof module:ejs-internal
 * @param {Error}  err      Error object
 * @param {String} str      EJS source
 * @param {String} filename file name of the EJS file
 * @param {String} lineno   line number of the error
 * @static
 */

function rethrow(err, str, filename, lineno) {
    var lines = str.split('\n'),
        start = Math.max(lineno - 3, 0),
        end = Math.min(lines.length, lineno + 3);

    // Error context
    var context = lines.slice(start, end).map(function(line, i) {
        var curr = i + start + 1;
        return (curr == lineno ? ' >> ' : '    ') +
            curr +
            '| ' +
            line;
    }).join('\n');

    // Alter exception message
    err.path = filename;
    err.message = (filename || 'ejs') + ':' +
        lineno + '\n' +
        context + '\n\n' +
        err.message;

    throw err;
}

/**
 * Copy properties in data object that are recognized as options to an
 * options object.
 *
 * This is used for compatibility with earlier versions of EJS and Express.js.
 *
 * @memberof module:ejs-internal
 * @param {Object}  data data object
 * @param {Options} opts options object
 * @static
 */

function cpOptsInData(data, opts) {
    _OPTS.forEach(function(p) {
        if (typeof data[p] != 'undefined') {
            opts[p] = data[p];
        }
    });
}

/**
 * Compile the given `str` of ejs into a template function.
 *
 * @param {String}  template EJS template
 *
 * @param {Options} opts     compilation options
 *
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `opts.client`, either type might be returned.
 * @public
 */

exports.compile = function compile(template, opts) {
    var templ;

    // v1 compat
    // 'scope' is 'context'
    // FIXME: Remove this in a future version
    if (opts && opts.scope) {
        if (!scopeOptionWarned) {
            scopeOptionWarned = true;
        }
        if (!opts.context) {
            opts.context = opts.scope;
        }
        delete opts.scope;
    }
    templ = new Template(template, opts);
    return templ.compile();
};

exports.includeAt = function(array, params, includeAtarray) {
    params.html = array.join('');
    includeAtarray.push(params);
}

exports.compileFile = function compile(path, data, array, component, tock) {
    var opts = utils.shallowCopy({}),
        includePath, template;
    if (component)
        opts.module = component;
    opts.filename = "./";
    if (!opts.filename) {
        throw new Error('`include` requires the \'filename\' option.');
    }

    includePath = exports.resolveInclude(path, opts.filename);
    template = fs.readFileSync(includePath).toString().replace(_BOM, '');

    opts.filename = includePath;
    var templ = new Template(template, opts);
    templ.generateSource();

    var prepended = '  with (' + data + ' || {}) {' + '\n';

    var appended = '  }' + '\n';
    //templ.
    array.ar = templ.dependenciesJs;
    array.arcss = templ.dependenciesCss;
    array.images = templ.dependenciesImages;
    if (tock) {
        return '  with (' + tock + ' || {}) {' + '\n' + prepended + templ.source + appended + '  }' + '\n';
    }
    return prepended + templ.source + appended;
};
/**
 * Render the given `template` of ejs.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}   template EJS template
 * @param {Object}  [data={}] template data
 * @param {Options} [opts={}] compilation and rendering options
 * @return {String}
 * @public
 */

exports.render = function(template, data, opts) {
    data = data || {};
    opts = opts || {};
    var fn;

    // No options object -- if there are optiony names
    // in the data, copy them to options
    if (arguments.length == 2) {
        cpOptsInData(data, opts);
    }

    return handleCache(opts, template)(data);
};



/**
 * Render an EJS file at the given `path` and callback `cb(err, str)`.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}             path     path to the EJS file
 * @param {Object}            [data={}] template data
 * @param {Options}           [opts={}] compilation and rendering options
 * @param {RenderFileCallback} cb callback
 * @public
 */

exports.renderFile = function() {
    var args = Array.prototype.slice.call(arguments),
        path = args.shift(),
        cb = args.pop(),
        data = args.shift() || {},
        opts = args.pop() || {},
        result;

    // Don't pollute passed in opts obj with new vals
    opts = utils.shallowCopy({}, opts);

    // No options object -- if there are optiony names
    // in the data, copy them to options
    if (arguments.length == 3) {
        cpOptsInData(data, opts);
    }
    opts.filename = path;

    try {
        result = handleCache(opts)(data);
    } catch (err) {
        return cb(err);
    }
    return cb(null, result);
};

exports.compileJs = function(template, array) {

    var templ = new Template(template, {});

    templ.compileJs();
    array.al = templ.dependenciesJs;
    array.alcss = templ.dependenciesCss;
    array.images = templ.dependenciesImages;

    return templ.templateText;
}

/**
 * Clear intermediate JavaScript cache. Calls {@link Cache#reset}.
 * @public
 */

exports.clearCache = function() {
    exports.cache.reset();
};

function Template(text, opts) {
    opts = opts || {};
    var options = {};
    this.templateText = text;
    this.mode = null;
    this.truncate = false;
    this.currentLine = 1;
    this.source = '';
    this.dependencies = [];
    options.client = opts.client || false;
    options.escapeFunction = opts.escape || utils.escapeXML;
    options.compileDebug = opts.compileDebug !== false;
    options.debug = !!opts.debug;
    options.filename = opts.filename;
    options.delimiter = opts.delimiter || exports.delimiter || _DEFAULT_DELIMITER;
    options._with = typeof opts._with != 'undefined' ? opts._with : true;
    options.context = opts.context;
    options.cache = opts.cache || false;
    options.rmWhitespace = opts.rmWhitespace;
    options.module = opts.module;
    this.opts = options;
    this.dependenciesJs = [];
    this.dependenciesCss = [];
    this.dependenciesImages = [];
    this.regex = this.createRegex();
}

Template.modes = {
    EVAL: 'eval',
    ESCAPED: 'escaped',
    RAW: 'raw',
    COMMENT: 'comment',
    LITERAL: 'literal'
};

Template.prototype = {
    dependenciesLinks: [], //取模板中的依赖描述。
    checkTemplateJS: function(template) {

    },
    createRegex: function() {
        var str = _REGEX_STRING,
            delim = utils.escapeRegExpChars(this.opts.delimiter);
        str = str.replace(/%/g, delim);
        return new RegExp(str);
    },
    imgSrcTem: function(templateText) {
            var imgReg = /<img.*?(?:>|\/>)/gi;
            //匹配src属性
            var srcReg = /src=[\'\"]?([^\'\"]*)[\'\"]?/i;
            var data_srcReg = /data\-src=[\'\"]?([^\'\"]*)[\'\"]?/i;
            var image_url_ele = /<.*background[^;"]+url\(([^\)]+)\).*\>/gi;
            //var __image_url_re =/.*background[^:"]+url\(([^\)]+)\).*/gi;
            //var __image_url_re =/url\s*\(\s*'*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|[^)}]+)([\'|\"])\s*'*\)/i;
            var __image_url_re = /url\s*\(\s*'*("(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|(?:[^\\"\r\n\f]|\\[\s\S])*|[^)}]+)([\'|\"])\s*'*\)/i; //有引号
            var __image_url_ = /url\s*\(\s*'*((?:[^\\"\r\n\f]|\\[\s\S])*)\s*'*\)/i; //无引号
            var online = /^(svn|ftp|http(s?)):/i;
            var arr = templateText.match(imgReg);
            var bgurlsrc = templateText.match(image_url_ele);
            var srcs = [];
            if (!!arr) {
                for (var i = 0; i < arr.length; i++) {
                    var src = arr[i].match(srcReg);
                    var self = this;
                    var datasrc = arr[i].match(data_srcReg);

                    //获取图片地址
                    //this.getImgArr();
                    if (src[1] && online.test(src[1]) == false) {
                        var includeOpts = utils.shallowCopy({}, self.opts);
                        var resourcePath = "";
                        var imgObj = {
                            module: '',
                            resourceName: '',
                            resourcePath: resourcePath
                        };
                        if (includeOpts.module) {
                            resourcePath = includeOpts.module.getResource(src[1]);
                            imgObj.module = includeOpts.module;
                            imgObj.resourceName = src[1];
                            imgObj.resourcePath = resourcePath;
                        } else {
                            //当前位置
                            resourcePath = path.resolve('./', resourcePath);
                            imgObj.module = null;
                            imgObj.resourceName = src[1];
                            imgObj.resourcePath = path.resolve(resourcePath, imgObj.resourceName);
                        }
                        if (srcs.indexOf(imgObj.resourceName) == -1) {
                            srcs.push(imgObj.resourceName);
                            this.dependenciesImages.push({
                                module: imgObj.module,
                                resourcePath: imgObj.resourceName,
                                fullpath: imgObj.resourcePath
                            });
                        }
                    }
                    if (!!datasrc) {
                        if (datasrc[1] && online.test(datasrc[1]) == false) {
                            // var includeOpts = utils.shallowCopy({}, self.opts);
                            // var resourcePath = "";
                            // var imgObj ={
                            //     module:'',resourceName:'',resourcePath:resourcePath
                            // };
                            if (includeOpts != null) {
                                if (includeOpts.module) {
                                    resourcePath = includeOpts.module.getResource(datasrc[1]);
                                    imgObj.module = includeOpts.module;
                                    imgObj.resourceName = datasrc[1];
                                    imgObj.resourcePath = resourcePath;
                                } else {
                                    //当前位置
                                    resourcePath = path.resolve('./', resourcePath);
                                    imgObj.module = null;
                                    imgObj.resourceName = datasrc[1];
                                    imgObj.resourcePath = path.resolve(resourcePath, imgObj.resourceName);
                                }
                                if (srcs.indexOf(imgObj.resourceName) == -1) {
                                    srcs.push(imgObj.resourceName);
                                    this.dependenciesImages.push({
                                        module: imgObj.module,
                                        resourcePath: imgObj.resourceName,
                                        fullpath: imgObj.resourcePath
                                    });
                                }
                            }
                        }
                    }

                }
            }
            if (!!bgurlsrc) {
                for (var i = 0; i < bgurlsrc.length; i++) {
                    var urlsrc = bgurlsrc[i].match(__image_url_re);
                    var urlsrc2 = bgurlsrc[i].match(__image_url_);
                    if (!!urlsrc) {
                        if (urlsrc[1] && online.test(urlsrc[1]) == false) {
                            // var includeOpts = utils.shallowCopy({}, self.opts);
                            // var resourcePath = "";
                            // var imgObj ={
                            //     module:'',resourceName:'',resourcePath:resourcePath
                            // };
                            if (includeOpts.module) {
                                resourcePath = includeOpts.module.getResource(urlsrc[1]);
                                imgObj.module = includeOpts.module;
                                imgObj.resourceName = urlsrc[1];
                                imgObj.resourcePath = resourcePath;
                            } else {
                                //当前位置
                                resourcePath = path.resolve('./', resourcePath);
                                imgObj.module = null;
                                imgObj.resourceName = urlsrc[1];
                                imgObj.resourcePath = path.resolve(resourcePath, imgObj.resourceName);
                            }
                            if (srcs.indexOf(imgObj.resourceName) == -1) {
                                srcs.push(imgObj.resourceName);
                                this.dependenciesImages.push({
                                    module: imgObj.module,
                                    resourcePath: imgObj.resourceName,
                                    fullpath: imgObj.resourcePath
                                });
                            }
                        }
                    }
                    if (!!urlsrc2) {
                        if (urlsrc2[1] && online.test(urlsrc2[1]) == false) {
                            // var includeOpts = utils.shallowCopy({}, self.opts);
                            // var resourcePath = "";
                            // var imgObj ={
                            //     module:'',resourceName:'',resourcePath:resourcePath
                            // };
                            if (includeOpts.module) {
                                resourcePath = includeOpts.module.getResource(urlsrc2[1]);
                                imgObj.module = includeOpts.module;
                                imgObj.resourceName = urlsrc2[1];
                                imgObj.resourcePath = resourcePath;
                            } else {
                                //当前位置
                                resourcePath = path.resolve('./', resourcePath);
                                imgObj.module = null;
                                imgObj.resourceName = urlsrc2[1];
                                imgObj.resourcePath = path.resolve(resourcePath, imgObj.resourceName);
                            }
                            if (srcs.indexOf(imgObj.resourceName) == -1) {
                                srcs.push(imgObj.resourceName);
                                this.dependenciesImages.push({
                                    module: imgObj.module,
                                    resourcePath: imgObj.resourceName,
                                    fullpath: imgObj.resourcePath
                                });
                            }
                        }
                    }
                }
            }
        }
        // ,  getImgArr:function(){

    //   }
    ,
    compile: function() {
        var src, fn, opts = this.opts,
            prepended = '',
            appended = '',
            escape = opts.escapeFunction;

        if (opts.rmWhitespace) {
            // Have to use two separate replace here as `^` and `$` operators don't
            // work well with `\r`.
            this.templateText =
                this.templateText.replace(/\r/g, '').replace(/^\s+|\s+$/gm, '');
        }

        // Slurp spaces and tabs before <%_ and after _%>
        this.templateText =
            this.templateText.replace(/[ \t]*<%_/gm, '<%_').replace(/_%>[ \t]*/gm, '_%>');

        // //在这里进行image 正则处理this.templateText，将结果push到this.dependenciesImages中
        // this.imgSrcTem(this.templateText);

        if (!this.source) {
            this.generateSource();
            prepended += '  var __output = [], __append = __output.push.bind(__output);' + '\n';
            prepended += '  var includeAtarray=[];' + '\n';

            if (opts._with !== false) {
                prepended += '  with (' + exports.localsName + ' || {}) {' + '\n';
                appended += '  }' + '\n';
            }
            appended += '  return {output:__output.join(""),includeAt:includeAtarray};debugger;' + '\n';
            this.source = prepended + this.source + appended;
        }

        if (opts.compileDebug) {
            src = 'var __line = 1' + '\n' +
                '  , __lines = ' + JSON.stringify(this.templateText) + '\n' +
                '  , __filename = ' + (opts.filename ?
                    JSON.stringify(opts.filename) : 'undefined') + ';' + '\n' +
                'try {' + '\n' +
                this.source +
                '} catch (e) {' + '\n' +
                '  rethrow(e, __lines, __filename, __line);' + '\n' +
                '}' + '\n';
        } else {
            src = this.source;
        }

        if (opts.debug) {
            log.debug(src);
        }

        if (opts.client) {
            src = 'escape = escape || ' + escape.toString() + ';' + '\n' + src;
            if (opts.compileDebug) {
                src = 'rethrow = rethrow || ' + rethrow.toString() + ';' + '\n' + src;
            }
        }

        try {
            loggerbuild.info(src);
            fn = new Function(exports.localsName + ', escape, include, rethrow,compileFile,includeAt', src);
        } catch (e) {
            loggerbuild.info(e);

            // istanbul ignore else
            if (e instanceof SyntaxError) {
                if (opts.filename) {
                    e.message += ' in ' + opts.filename;
                }
                e.message += ' while compiling ejs';
            }
            throw e;
        }

        if (opts.client) {
            fn.dependencies = this.dependencies;
            return fn;
        }

        // Return a callable function which will execute the function
        // created by the source-code, with the passed data as locals
        // Adds a local `include` function which allows full recursive include
        var returnedFn = function(data) {
            var include = function(path, includeData) {
                var d = utils.shallowCopy({}, data);
                if (includeData) {
                    d = utils.shallowCopy(d, includeData);
                }
                return includeFile(path, opts)(d);
            };
            return fn.apply(opts.context, [data || {}, escape, include, rethrow, exports.compileFile, exports.includeAt]);
        };
        returnedFn.dependenciesCss = this.dependenciesCss;
        returnedFn.dependenciesJs = this.dependenciesJs;
        returnedFn.dependenciesImages = this.dependenciesImages;

        return returnedFn;
    }

    ,
    getComponent: function(cname) {
            return Comp.getComponent(cname);
        }
        //编译js，获取所有相关js列表。

    ,
    compileJs: function() {

        var self = this,
            matches = this.parseTemplateText(),
            d = this.opts.delimiter;
        if (matches && matches.length) {
            matches.forEach(function(line, index) {
                var opening, closing, include, includeOpts, includeSrc;
                // If this is an opening tag, check for closing tags
                // FIXME: May end up with some false positives here
                // Better to store modes as k/v with '<' + delimiter as key
                // Then this can simply check against the map
                if (line.indexOf('<' + d) === 0 // If it is a tag
                    &&
                    line.indexOf('<' + d + d) !== 0) { // and is not escaped
                    closing = matches[index + 2];
                    if (!(closing == d + '>' || closing == '-' + d + '>' || closing == '_' + d + '>')) {
                        throw new Error('Could not find matching close tag for "' + line + '".');
                    }
                }
                if ((include = line.match(/^\s*referjs\s+(\S+)/))) {

                    opening = matches[index - 1];
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);
                        self.dependenciesJs.push(include[1]);
                        self.templateText = self.templateText.replace(opening + line + "%>", '');
                        return;
                    }
                }

                if ((include = line.match(/^\s*refercss\s+(\S+)/))) {

                    opening = matches[index - 1];
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);
                        self.dependenciesCss.push(include[1]);
                        self.templateText = self.templateText.replace(opening + line + "%>", '');
                        return;
                    }
                }



            });
        }
    },
    generateSource: function(opts) {
        //处理下this.teplatetext
        //chuli图片  push
        if (!opts) {
            opts = {};
        }

        var self = this,
            matches = this.parseTemplateText(),
            d = this.opts.delimiter;

        self.imgSrcTem(this.templateText);

        if (matches && matches.length) {
            matches.forEach(function(line, index) {
                var opening, closing, include, includeOpts, includeSrc;
                // If this is an opening tag, check for closing tags
                // FIXME: May end up with some false positives here
                // Better to store modes as k/v with '<' + delimiter as key
                // Then this can simply check against the map
                if (line.indexOf('<' + d) === 0 // If it is a tag
                    &&
                    line.indexOf('<' + d + d) !== 0) { // and is not escaped
                    closing = matches[index + 2];
                    if (!(closing == d + '>' || closing == '-' + d + '>' || closing == '_' + d + '>')) {
                        throw new Error('Could not find matching close tag for "' + line + '".');
                    }
                }
                // HACK: backward-compat `include` preprocessor directives
                // if ((include = line.match(/^\s*include\s+(\S+)/))) {

                if ((include = line.match(/^\s*include\s+(\S+)\s+(\D*)/))) {

                    opening = matches[index - 1];
                    if (opts.jscomplie)
                        return;
                    // Must be in EVAL or RAW mode
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);

                        includeSrc = includeSource(include[1], includeOpts);
                        if (include[2] != null) {
                            var arrayjs = [];
                            includeSrc = exports.compileFile(include[1], include[2], arrayjs);
                            self.dependenciesJs.concat(arrayjs);
                            includeSrc = '    ; (function(){' + '\n' + includeSrc +
                                '    ; })()' + '\n';
                        } else {
                            includeSrc = '    ; (function(){' + '\n' + includeSrc +
                                '    ; })()' + '\n';
                        }

                        self.source += includeSrc;

                        self.dependencies.push(exports.resolveInclude(include[1],
                            includeOpts.filename));
                        return;
                    }
                }

                if ((include = line.match(/^\s*includeModule\s+(\S+)\s+([\s\S]*)/))) {
                    opening = matches[index - 1];
                    if (opts.jscomplie)
                        return;
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);

                        var moduleName = include[1];

                        //以传入参数为大。。tock数据为小

                        try {
                            var elparams = include[2];
                            var component = self.getComponent(moduleName);
                            var tockString = component.getTockDataString();
                            includeOpts.module = component;
                        } catch (ee) {
                            var a = 1;
                        }
                        if (include[2] != null) {
                            var arrayjs = {
                                ar: [],
                                arcss: [],
                                images: []
                            };
                            includeSrc = exports.compileFile(component.getMainTemplatePath(), elparams, arrayjs, component, tockString);
                            self.dependenciesJs = self.dependenciesJs.concat(arrayjs.ar);
                            self.dependenciesCss = self.dependenciesCss.concat(arrayjs.arcss);
                            self.dependenciesImages = self.dependenciesImages.concat(arrayjs.images);
                            includeSrc = ';__append("\\r\\n <!--module begin:' + component.name + '-->");' + includeSrc + '; __append("\\r\\n <!--module end:' + component.name + '-->");';
                            includeSrc = '    ; (function(){' + '\n' + includeSrc +
                                '    ; })()' + '\n';
                        } else {
                            includeSrc = includeSource(component.getMainTemplatePath(), includeOpts);
                            includeSrc = ';__append("\\r\\n <!--module begin:' + component.name + '-->");' + includeSrc + ';__append("\\r\\n <!--module end:' + component.name + '-->");';
                            includeSrc = '    ; (function(){' + '\n' + includeSrc +
                                '    ; })()' + '\n';
                        }

                        self.source += includeSrc;

                        self.dependencies.push(exports.resolveInclude(include[1],
                            includeOpts.filename));
                        return;
                    }
                }


                if ((include = line.match(/^\s*includeJs\s+(\S+)/))) {
                    opening = matches[index - 1];
                    if (opts.jscomplie)
                        return;
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);
                        var resourcePath = "";
                        var jsObj = {
                            module: '',
                            resourceName: '',
                            resourcePath: resourcePath
                        };


                        if (includeOpts.module) {
                            resourcePath = includeOpts.module.getResource(include[1]);
                            jsObj.module = includeOpts.module.name;
                            jsObj.resourceName = include[1];
                            jsObj.resourcePath = resourcePath;
                        } else {
                            //当前位置
                            if (/^(svn|ftp|http(s?)):/.test(include[1]) == true) { //有线上资源
                                resourcePath = include[1];
                            } else {
                                resourcePath = path.resolve('./', resourcePath);
                            }
                            jsObj.module = null;
                            jsObj.resourceName = include[1];
                            jsObj.resourcePath = resourcePath;
                        }
                        //includeSrc = includeSource(resourcePath, includeOpts);
                        self.dependenciesJs.push(jsObj);
                        //includeSrc = '    ; (function(){' + '\n' +   ' ; __append("<% referjs %>");' +
                        //    '    ; })()' + '\n';

                        includeSrc = '    ; (function(){' + '\n' + ' ; __append("<% referjs ' + resourcePath.replace(/\\/g, "\\\\") + '%>");' +
                            '})()' + '\n';
                        self.source += includeSrc;
                        self.dependencies.push(exports.resolveInclude(include[1],
                            includeOpts.filename));
                        return;
                    }
                }
                if ((include = line.match(/^\s*includeCss\s+(\S+)/))) {
                    opening = matches[index - 1];
                    if (opts.jscomplie)
                        return;
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);
                        var resourcePath = "";
                        var jsObj = {
                            module: '',
                            resourceName: '',
                            resourcePath: resourcePath
                        };
                        if (includeOpts.module) {
                            resourcePath = includeOpts.module.getResource(include[1]);
                            jsObj.module = includeOpts.module.name;
                            jsObj.resourceName = include[1];
                            jsObj.resourcePath = resourcePath;
                        } else {
                            //当前位置

                            if (/^(svn|ftp|http(s?)):/.test(include[1]) == true) { //有线上资源
                                resourcePath = include[1];
                            } else {
                                resourcePath = path.resolve('./', resourcePath);
                            }
                            jsObj.module = null;
                            jsObj.resourceName = include[1];
                            jsObj.resourcePath = resourcePath;
                        }
                        //includeSrc = includeSource(resourcePath, includeOpts);
                        self.dependenciesCss.push(jsObj);
                        //includeSrc = '    ; (function(){' + '\n' +   ' ; __append("<% referjs %>");' +
                        //    '    ; })()' + '\n';

                        includeSrc = '    ; (function(){' + '\n' + ' ; __append("<% refercss ' + resourcePath.replace(/\\/g, "\\\\") + '%>");' +
                            '})()' + '\n';
                        self.source += includeSrc;
                        self.dependencies.push(exports.resolveInclude(include[1],
                            includeOpts.filename));
                        return;
                    }
                }


                //处理html整体切入的元素,,这里不支持嵌套。如果需要。之后可以扩展强依赖的嵌套，
                //就是在includeAt 之后加入参数，在endAt中也加入参数来简单实现。不过不能支持弱依赖
                if ((include = line.match(/^\s*includeAt\s+(\D*)/))) {

                    opening = matches[index - 1];
                    if (opts.jscomplie)
                        return;
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);
                        var resourcePath = "";
                        var jsObj = {
                            module: '',
                            resourceName: '',
                            resourcePath: resourcePath
                        };
                        var params = include[1];
                        includeSrc = ';var append  =  __append;';

                        //\r\n\t\
                        params = params.replace(/\r/g, '').replace(/\n/g, '').replace(/\t/g, '');
                        includeSrc += ';var params =' + include[1] + ";";

                        includeSrc += ';var array = [];';
                        includeSrc += ';__append=function(o){ array.push(o)};';
                        self.source += includeSrc;
                        return;
                    }
                }
                //处理html整体切入的元素
                if ((include = line.match(/^\s*endAt\s+/))) {
                    opening = matches[index - 1];
                    if (opts.jscomplie)
                        return;
                    if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
                        includeOpts = utils.shallowCopy({}, self.opts);
                        var resourcePath = "";
                        var jsObj = {
                            module: '',
                            resourceName: '',
                            resourcePath: resourcePath
                        };
                        includeSrc = ';__append = append;includeAt(array,params,includeAtarray);';
                        self.source += includeSrc;
                        return;
                    }
                }
                self.scanLine(line);
            });
        }
    }

    ,
    parseTemplateText: function() {
        var str = this.templateText,
            pat = this.regex,
            result = pat.exec(str),
            arr = [],
            firstPos, lastPos;

        while (result) {
            firstPos = result.index;
            lastPos = pat.lastIndex;

            if (firstPos !== 0) {
                arr.push(str.substring(0, firstPos));
                str = str.slice(firstPos);
            }

            arr.push(result[0]);
            str = str.slice(result[0].length);
            result = pat.exec(str);
        }

        if (str) {
            arr.push(str);
        }

        return arr;
    }

    ,
    scanLine: function(line) {
        var self = this,
            d = this.opts.delimiter,
            newLineCount = 0;
        if (line.replace(/\r\n/ig, '').replace(/\s+/g, '') == '') {
            line = '';
        }

        function _addOutput() {
            if (self.truncate) {
                line = line.replace('\n', '');
                self.truncate = false;
            } else if (self.opts.rmWhitespace) {
                // Gotta me more careful here.
                // .replace(/^(\s*)\n/, '$1') might be more appropriate here but as
                // rmWhitespace already removes trailing spaces anyway so meh.
                line = line.replace(/^\n/, '');
            }
            if (!line) {
                return;
            }

            // Preserve literal slashes
            line = line.replace(/\\/g, '\\\\');

            // Convert linebreaks
            line = line.replace(/\n/g, '\\n');
            line = line.replace(/\r/g, '\\r');

            // Escape double-quotes
            // - this will be the delimiter during execution
            line = line.replace(/"/g, '\\"');
            self.source += '    ; __append("' + line + '")' + '\n';
        }

        newLineCount = (line.split('\n').length - 1);

        switch (line) {
            case '<' + d:
            case '<' + d + '_':
                this.mode = Template.modes.EVAL;
                break;
            case '<' + d + '=':
                this.mode = Template.modes.ESCAPED;
                break;
            case '<' + d + '-':
                this.mode = Template.modes.RAW;
                break;
            case '<' + d + '#':
                this.mode = Template.modes.COMMENT;
                break;
            case '<' + d + d:
                this.mode = Template.modes.LITERAL;
                this.source += '    ; __append("' + line.replace('<' + d + d, '<' + d) + '")' + '\n';
                break;
            case d + '>':
            case '-' + d + '>':
            case '_' + d + '>':
                if (this.mode == Template.modes.LITERAL) {
                    _addOutput();
                }

                this.mode = null;
                this.truncate = line.indexOf('-') === 0 || line.indexOf('_') === 0;
                break;
            default:
                // In script mode, depends on type of tag
                if (this.mode) {
                    // If '//' is found without a line break, add a line break.
                    switch (this.mode) {
                        case Template.modes.EVAL:
                        case Template.modes.ESCAPED:
                        case Template.modes.RAW:
                            if (line.lastIndexOf('//') > line.lastIndexOf('\n')) {
                                line += '\n';
                            }
                    }
                    switch (this.mode) {
                        // Just executing code
                        case Template.modes.EVAL:
                            this.source += '    ; ' + line + '\n';
                            break;
                            // Exec, esc, and output
                        case Template.modes.ESCAPED:
                            this.source += '    ; __append(escape(' +
                                line.replace(_TRAILING_SEMCOL, '').trim() + '))' + '\n';
                            break;
                            // Exec and output
                        case Template.modes.RAW:
                            this.source += '    ; __append(' +
                                line.replace(_TRAILING_SEMCOL, '').trim() + ')' + '\n';
                            break;
                        case Template.modes.COMMENT:
                            // Do nothing
                            break;
                            // Literal <%% mode, append as raw output
                        case Template.modes.LITERAL:
                            _addOutput();
                            break;
                    }
                }
                // In string mode, just add the output
                else {
                    _addOutput();
                }
        }

        if (self.opts.compileDebug && newLineCount) {
            this.currentLine += newLineCount;
            this.source += '    ; __line = ' + this.currentLine + '\n';
        }
    }
};

/**
 * Express.js support.
 *
 * This is an alias for {@link module:ejs.renderFile}, in order to support
 * Express.js out-of-the-box.
 *
 * @func
 */

exports.__express = exports.renderFile;

// Add require support
/* istanbul ignore else */
if (require.extensions) {
    require.extensions['.ejs'] = function(module, filename) {
        filename = filename || /* istanbul ignore next */ module.filename;
        var options = {
                filename: filename,
                client: true
            },
            template = fs.readFileSync(filename).toString(),
            fn = exports.compile(template, options);
        module._compile('module.exports = ' + fn.toString() + ';', filename);
    };
}

/* istanbul ignore if */
if (typeof window != 'undefined') {
    window.ejs = exports;
}

exports.preBuildTemplate = function(template) {
    var templ = new Template(template, { compileDebug: false });


    templ.generateSource({
        jscomplie: true
    });


    var prepended = '  ';
    var appended = ' ' + '\n';
    var varsdef = "for(var $keykeykey in $TemplateData){eval('var ' +$keykeykey +'=$TemplateData[$keykeykey]')}  var tempContent = [];var __append=function(n){tempContent.push(n)}; \n\t";
    return prepended + varsdef + templ.source + "\n\t return tempContent.join('')" + appended;
}


//exports.preBuildTemplate("fdsafdsafsafsafadfa");