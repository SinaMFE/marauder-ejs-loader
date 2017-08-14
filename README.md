# marauder-ejs-loader

`webpack-ejs-loader` 的修改版，编译后将会去除 `with` 关键字，使模块在严格模式下可用。

安装：

```
 yarn add marauder-ejs-loader
```

在webpack配置中的loader中设置如下代码

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



