# 蚁记微信小程序

原生微信小程序前端，使用 JavaScript、WXML 和 WXSS 开发，无需 npm 依赖。与 AntKeep App 共用 Java 服务，当前定位为公共资料浏览、账号与签到入口。

## 当前功能

- **发现**：读取后台已发布的入门资料、公告、养护提示和文章，支持详情阅读与下拉刷新。
- **账号**：用户名密码注册、登录与退出；用户名支持 3–32 位汉字、字母、数字或下划线，密码为 8–64 个字符。注册根据服务端规则选填或必填邀请码，不使用微信授权登录。
- **签到**：按服务端北京时间每日签到，展示今日状态、累计及连续签到天数，同一账号与 App 共用签到数据。
- **隐私说明**：查看当前已发布版本，账号操作前要求阅读并同意；版本变化时要求重新确认。

当前没有蚁群建档、养殖日记、照片、备份、物品推送或比赛页面，也不提供 App 本地数据同步。

## 数据与会话

令牌和密码只在运行内存中使用，进程结束后需重新登录；退出登录或会话失效时清除内存会话。用户同意的隐私协议版本和时间保存在小程序本机存储中，服务端当前没有小程序渠道的同意记录接口。

## 本地运行

1. 用微信开发者工具导入本目录，把 `project.config.json` 中的 `touristappid` 换成自己的小程序 AppID。
2. 在小程序管理后台配置 `https://pipiele.xyz` 为 `request` 合法域名。若使用其他服务地址，同时修改 `miniprogram/config.js` 中的 `API_BASE_URL`；正式环境须使用 HTTPS。
3. 在 Java 服务发布隐私协议及公共内容，启动服务后编译小程序。未发布隐私协议时，账号操作会被禁用；未发布公共内容时，首页显示空状态。

仓库仍使用 `touristappid`，目前提供源码和本地测试；本介绍不作为微信开发者工具、真机、体验版或正式发布的验收凭据。发布前需用真实 AppID 完成域名配置与平台验收。

## 目录结构

- `miniprogram/pages/`：发现、文章详情、签到、我的、账号和隐私说明页面。
- `miniprogram/services/`：公共内容解析、HTTP 请求与会话失效处理。
- `miniprogram/config.js`：共用 Java 服务地址。
- `tests/flows.test.js`：内容、账号、隐私同意、签到与会话流程测试。

## 本地验证

```sh
node --test tests/*.test.js
```

项目不需要 npm 依赖。`project.private.config.json`、生成文件及本机日志不入库。

## 配套项目

- [antkeep](../antkeep/README.md)：Flutter App，提供本地养殖记录、分析、备份及可选在线功能。
- [antkeep-content-admin](../antkeep-content-admin/README.md)：账号、签到、公共资料、协议和注册规则的 Java 服务及运营后台。
- [antkeep-official](../sites/antkeep-official/README.md)：产品介绍、Android 下载与网页试用；小程序不承载该 Flutter Web 试用版。
