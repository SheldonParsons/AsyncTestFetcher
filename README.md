# AsyncTest Fetcher

一个运行在 Chrome 原生侧边栏（panel）中的 AsyncTest 扩展。

当前版本 `0.1.0` 提供欢迎页、真实 AsyncTest 登录、用户头像、持久化登录态、记住账号密码、本地退出和服务配置。配置支持 HTTP/HTTPS、域名/IP、自定义端口及部署路径。

当前没有录制或自动上传功能。AsyncTest 是唯一 API 后端，网络请求统一在 `src/api/asynctest/` 管理并由扩展后台发起。

## 开发环境

- 固定开发目录：`/Users/sheldon/Documents/GithubProject/AsyncTestFetcher`，直接在 `main` 分支开发。除非用户明确要求，不创建独立 worktree。
- Node.js 22 或更高版本（使用 nvm 时运行 `nvm use`）。
- Chrome 125 或更高版本，Manifest V3。

```sh
cd /Users/sheldon/Documents/GithubProject/AsyncTestFetcher
nvm use
npm ci
npm run build
```

依赖版本已通过 `package-lock.json` 锁定。构建会从原始 SVG 生成 Chrome 所需的 PNG 图标，并将可加载产物放在 `.output/chrome-mv3`。

## 在 Chrome 加载

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点击「加载未打包的扩展程序」。
3. 选择本项目中的 **`.output/chrome-mv3`** 文件夹（不是源码根目录）。
4. 将 AsyncTest Fetcher 固定到工具栏，点击图标打开 panel。
5. 通过「配置 AsyncTest 服务」填写后端基础地址，点击登录时允许 Chrome 访问该服务，再使用现有账号登录。

当前开发目录下可直接加载的完整路径：

```text
/Users/sheldon/Documents/GithubProject/AsyncTestFetcher/.output/chrome-mv3
```

此目录由 `npm run build` 生成，不需要开发服务器持续运行。macOS 文件选择器中可以按 `⌘⇧G` 粘贴完整路径。源码修改后重新构建，再在扩展管理页刷新扩展。

若此前加载的是 Codex worktree 下的扩展，请改为加载上面的新目录。Chrome 可能将不同路径识别为不同的未打包扩展；新加载后如果配置/登录信息未保留，重新配置并登录即可。

Chrome 的用户设置决定侧边栏位于左侧还是右侧，界面按右侧窄栏设计。关闭并重新打开 panel 后，已保存的服务配置仍保留。配置校验只检查地址格式，**不代表服务器连通性已验证**。

服务地址填写 **API 基础地址**，包含反向代理的部署前缀。例如直连本地后端可填 `http://localhost:6001`；沿现有公网 Web 代理通常填写 `https://asynctest.com/server`。程序保留地址中的端口和路径，不会猜测、试发或自动添加 `/api`、`/server`。部署差异以你的服务为准。

## 登录与会话

- 登录：`POST {base}/anonymous/login/`，JSON `username/password`。鉴权格式为 `Authorization: token=<不透明凭证>`，不是 Bearer/JWT。
- 恢复或手动验证：`GET {base}/user/me/`，获取真实用户信息和完整 `avatar_url`。轻量定期验证使用 `GET {base}/token/check`。仅在 panel 可见时定期检查；浏览器关闭期间不发请求。
- 登录态保存在 `chrome.storage.local`，按完整基础地址隔离，关闭 panel 或浏览器后仍保留。服务器明确失效（401、403/1001 或 check 返回 0）时清除；断网、5xx、非鉴权 403、权限撤回保留登录资料，标记为待验证，不当作已验证权限。
- 切换服务不会把旧服务的 Token 发给新服务；回到已登录的服务时可恢复该服务的会话。不会按本地固定天数擅自过期，也不会自动重发密码登录。
- **退出仅清除当前服务在插件中的本地登录态。** 按用户要求不调用后端的账号级退出接口，不影响其他客户端，也不宣称撤销服务端 Token。
- **现有后端为每账号单 Token。新登录会使该账号其他客户端的旧 Token 失效。** 这是现有后端合同，扩展没有改变它。

会话只保存 Token 和最小用户资料，不保存 `private_key` 或整个登录响应。Token 不通过后台消息返回给页面，不给头像 URL 附加 Authorization。头像显示后端提供的 URL（保留版本参数），加载失败显示昵称首字。

“记住账号和密码”默认开启。只有本次真实登录成功后才更新所选服务的账号密码，失败不会覆盖上次成功记录。下次进入登录页会回填，密码默认隐藏；退出登录和 Token 失效不会删除记住的密码。取消勾选会立即清除当前服务保存的账号密码，并保持关闭偏好。凭据按完整基础地址隔离，读取接口只向可信 panel 提供当前服务的记录。

## Logo 动画与登录后布局

- 登录成功后播放固定 **3000ms** 过场，归位和淡出包含在总时长中。页面内容在过场开始时并行挂载，不等待动画才加载；时长不受后续网络请求影响。常规会话恢复、登录失败不会触发。退出、切换服务、卸载会取消旧动画。
- 欢迎页大 Logo 卡片 hover 使用同一套视觉实现，悬停循环、移出约260ms归位。绿色长条切换为用户确认的清透浅彩虹；两根黑条始终纯黑，光晕透明度0.24。减少动态效果模式使用静态 Logo，hover 不运动；成功过场仍在3秒后结束。
- 头像、昵称、账号及退出按钮放在底部账号栏；点击头像向上打开菜单，显示完整服务信息和服务配置入口。过场为纯白背景，Logo下方显示“AsyncTest Fetcher”。

## 可选的热更新模式

在开发目录运行 `npm run dev`，保持命令运行，按 WXT 输出的目录加载开发产物（默认 `.output/chrome-mv3-dev`）。此模式依赖本地开发服务器；它与上面的独立构建目录不同，不要混用。命令不会自动打开浏览器或安装扩展。

## 结构

```text
src/
  api/asynctest/               唯一后端 API：请求、错误、登录/鉴权/用户资料
  auth/                       后台会话所有者、持久化、页面消息协议
  entrypoints/background.ts    工具栏、可信 panel 消息入口
  entrypoints/sidepanel/       panel 入口和页面切换
  ui/views/                   欢迎、登录、账号、服务配置页面
  ui/components/              Morphicons 图标和服务摘要
  ui/motion/                  共享 Fetcher Logo 动画与减少动态效果处理
  ui/styles/                  黑白灰主题和 Transitions.dev 动效
  settings/                   服务地址校验与本地保存
public/                       原始 Logo 与生成的 PNG 图标
scripts/build-icons.mjs        可重复执行的图标构建
wxt.config.ts                 扩展清单和构建设置
```

UI 使用 Vue 3、Reka UI、Morphicons + Lucide，页面切换采用 Transitions.dev 的 Panel reveal CSS。依赖/素材来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。没有引入 Prettier、Naive UI 或额外状态管理框架。

## 权限和数据

固定权限为 `sidePanel` 和 `storage`；HTTP/HTTPS 主机权限声明为可选，只在用户点击登录或重新验证时申请当前配置主机。Chrome 主机授权不区分端口，实际 API 请求仍严格绑定完整服务基础地址。没有 debugger 权限、网页内容脚本或任意 URL 代理。Logo、字体（系统字体）、组件代码均在本地；头像来自后端给出的资源地址。

服务配置、Token、最小用户资料以及用户选择记住的账号密码存储在 `chrome.storage.local`，没有额外的密码加密层。访问级别限定为扩展可信上下文，可以访问该浏览器配置或扩展调试工具的人仍可能查看本地数据。扩展卸载会移除扩展本地存储。

## 验证约定

默认仅完成代码修改和必要构建，由用户自行审核。除非用户明确要求，不运行测试、浏览器 QA 或额外验收套件。

用户授权测试时，测试代码放在 `/Users/sheldon/Documents/AsyncTest/ast-testing-core`，截图、报告等放在 `/Users/sheldon/Documents/AsyncTest/ast-testing-core-data`。类型检查、构建、普通网页中的 UI 验证和真实 Chrome 扩展验收分别报告，不互相替代。

`.gitignore` 排除依赖、构建产物、WXT 缓存、本地环境文件、编辑器临时文件及验证数据。提交源码、锁文件、Logo素材和必要文档；构建目录由本地命令生成，不推送到 Git。
