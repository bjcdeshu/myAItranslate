# myAItranslate

面向个人使用的 Chrome 翻译扩展维护版，重点解决自定义 AI 服务兼容性、视频字幕稳定性和 YouTube 双语画中画。

## 当前版本

`1.29.1-maint.2`

## 主要功能

- 自动补全 OpenAI 兼容服务和 Anthropic 兼容服务的 Base URL 请求路径，同时保留显式填写的完整接口地址。
- 视频字幕使用独立的请求分批限制，不影响普通网页翻译。
- 修复 YouTube 异常字幕时间轴、重复字幕、超长字幕和翻译字幕错位。
- 支持 YouTube 双语画中画，字幕跟随页面当前的原文、译文或双语模式。
- 画中画窗口支持播放、暂停、前后跳转 10 秒、静音和关闭。

## 安装

Chrome 需要加载解压后的扩展目录，不能直接加载 ZIP。

1. 下载发布包并解压到一个不会随意移动的固定目录，例如 `C:\Apps\myAItranslate-1.29.1-maint.2`。
2. 打开 `chrome://extensions`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择包含 `manifest.json` 的目录。

## 更新

将新版本解压到固定目录后，在 `chrome://extensions` 中点击该扩展的“重新加载”，再刷新已经打开的网页。

如果直接使用本仓库，也可以更新仓库文件后执行相同的“重新加载 + 刷新网页”操作。

## YouTube 双语画中画

双语画中画需要 Chrome 116 或更高版本。该功能没有单独的设置开关；扩展生效后，按钮会直接出现在 YouTube 播放器右下角控制区。

1. 打开 YouTube 视频页面。
2. 开启视频字幕和字幕翻译。
3. 点击播放器右下角的双语画中画按钮。
4. 再次点击按钮，或关闭画中画窗口，即可退出。

如果按钮没有出现，先在扩展管理页重新加载扩展，再刷新 YouTube 页面。

## ZIP 交付方式

ZIP 只用于下载、搬运和备份。实际安装时仍需先解压，再让 Chrome 加载解压目录。发布 ZIP 不提交到 `main`，避免把二进制交付物混入源码历史。

## 维护校验

```bash
npm run verify:p0
node maintenance/patches/apply-youtube-pip.mjs --check
node --check youtube-pip.js
node --test maintenance/tests/youtube-pip.test.mjs
```

功能说明见 [`docs/P0-BACKPORTS.md`](docs/P0-BACKPORTS.md) 和 [`docs/YOUTUBE-PIP.md`](docs/YOUTUBE-PIP.md)。
