# marauder-ejs-loader

`webpack-ejs-loader` 的修改版，编译后将会去除 `with` 关键字，使模块在严格模式下可用。

安装：

```
 yarn add marauder-ejs-loader
```

在 webpack 配置中添加 loader

```
{
	test: /\.ejs$/,
	loader: 'marauder-ejs-loader'
}
```

代码中：

```
import templateFn from "./feed.ejs";
```



