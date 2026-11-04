<p align="center">
  <img src="../public/logo-tile.svg" alt="PiCG logo" width="96">
</p>

# PiCG

<p align="right">
    <a href="../README.md">English</a> | <strong>中文</strong> | <a href="./README_JP.md">日本語</a>
</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)<br>
[![CI](https://github.com/lutianyu2001/PiCG/actions/workflows/ci.yml/badge.svg)](https://github.com/lutianyu2001/PiCG/actions/workflows/ci.yml)

一个轻量的图床：在浏览器里把图片上传到你自己的 GitHub 仓库，并生成图片链接。

## 目录

- [概述](#概述)
- [功能特性](#功能特性)
- [前置要求](#前置要求)
- [安装](#安装)
- [用法](#用法)
- [GitHub Pages](#github-pages)
- [设置文件](#设置文件)
- [部署](#部署)
- [测试](#测试)
- [兼容性](#兼容性)
- [免责声明](#免责声明)
- [许可证](#许可证)
- [作者](#作者)

## 概述

PiCG 是一个没有服务器的静态网站。它在浏览器中用 Fine-grained personal access token 直接调用 GitHub REST API，把图片作为文件存进公开仓库，并生成指向 GitHub、GitHub Pages 或 CDN 的链接。图片在上传前可以在浏览器中压缩、加水印。

PiCG 最初打算分叉 [PicX v3.0.2 版本](https://github.com/XPoet/picx/releases/tag/v3.0.2)（commit [d2c5db7](https://github.com/XPoet/picx/commit/d2c5db77901856656a545905208647c95dfff910)，2024-04-30）改一改来用，这是 PicX 在 v3.1.0 改版前的最后一个版本。但改动越来越多，最后发现还不如从头重写。现在的 PiCG 与 PicX 没有任何代码关联。唯一的非代码关联是 PiCG 与 PicX 的设置文件保持兼容：它能读取 PicX 以及早期基于 PicX 的 PiCG 版本保存的设置，并转换成自己的格式。

## 功能特性

- 每个仓库一个图库页面：用可编辑的路径浏览文件夹（点某一级即可返回，也可以直接输入路径，有候选提示），拖入、粘贴或选择图片，上传到你所在的文件夹；拖到某个文件夹上就上传到那里，拖入文件夹则保留其目录结构
- 上传队列：显示图片会传到哪里，可以重命名，整批作为一个 commit 上传；也可以设为添加后立即上传
- 上传的子文件夹：不加、按时间命名（date-fns 格式可调，如 `yyyy/MM`）或自定义名称
- 文件名可加内容哈希和前缀
- 每个文件夹最多 1000 个文件，超过上限的上传会失败，上传失败时会说明原因
- 压缩为 WebP、AVIF 或 JPEG（MozJPEG）并加文字水印，用 jSquash 在 Web Worker 中完成
- 上传时转换 HEIC 和 HEIF 照片；浏览器无法解码时加载 libheif（LGPL-3.0），它作为单独的文件放在 `heif/` 中（见 [NOTICE](../NOTICE)）
- 上传前去除拍摄地点等照片元数据，保留图片方向和色彩配置文件
- 不重新编码的重命名、删除、属性查看、多选（复选框、Shift 点击、长按）、批量复制和删除
- 链接规则：GitHub、GitHub Pages、jsDelivr、Statically 和 jsDelivr 镜像，也可以自定义；可复制为纯链接、Markdown、HTML、BBCode 或自定义格式
- GitHub Pages 直接发布图床分支，无需部署；PiCG 会显示 Pages 是否开启，并能设置自定义域名
- 支持多个仓库，每个仓库的设置分别存放在 `.picg/settings.toml` 中，每次修改后几秒自动写回
- 从其他仓库导入：复制这里还没有的图片，保留原路径
- 工具箱：压缩、转 Base64、加水印，无需登录
- 简体中文、繁体中文、英文和日文界面，顶栏有语言按钮
- 浅色和深色主题，点顶栏的太阳或月亮按钮切换；也可以在**设置**里选择跟随系统
- Material 3 动效：切换页面时内容淡出淡入，文件夹和图片依次出现；默认跟随系统的“减少动态效果”，也可以在**设置**里开启或关闭
- 从 jsDelivr 加载开源字体，超时后换用 npmmirror：Inter 和 Noto Sans（界面语言对应的中日文字体优先），标题的西文使用 Josefin Sans
- 可安装为 PWA，手机上使用底部导航栏；页面一直开着也会提示新版本

## 前置要求

- 一个 GitHub 账号
- 从源码构建时：
  - pnpm 12.16.1，由 `package.json` 的 `packageManager` 固定
  - Node.js 24.22.2，由 `package.json` 的 `devEngines.runtime` 固定；pnpm 会为项目下载它，所以 `pnpm` 脚本不使用你全局安装的 Node.js

## 安装

### 使用托管站点（推荐）

打开 [https://picg.lu.fm](https://picg.lu.fm)。要安装为应用，使用浏览器地址栏或菜单中的安装按钮。

### 从源码构建

1. 克隆仓库并安装依赖：

   ```bash
   git clone https://github.com/lutianyu2001/PiCG.git
   cd PiCG
   pnpm install
   ```

2. 启动开发服务器，或构建站点：

   ```bash
   pnpm dev
   pnpm build
   ```

| 命令 | 说明 |
|---------|-------------|
| `pnpm dev` | 复制编码器二进制文件，然后在 4000 端口启动应用并打开 |
| `pnpm build` | 把站点构建到 `dist/picg/browser/` |
| `pnpm serve` | 在 4173 端口预览生产构建 |
| `pnpm wasm` | 把 jSquash 编码器二进制文件及其许可证从 `node_modules/@jsquash` 复制到 `public/wasm/`；`dev` 和 `build` 会先运行它 |
| `pnpm test` | 运行单元测试 |
| `pnpm e2e` | 在无头 Chromium 中对着模拟的 GitHub API 运行端到端测试（需先构建） |
| `pnpm e2e:real` | 对着真实的 GitHub API 运行冒烟测试（见[测试](#测试)） |
| `pnpm typecheck` | 检查代码和模板的类型 |
| `pnpm lint` | 用 ESLint 检查代码 |

应用的行为见 [`docs/spec.md`](../docs/spec.md)。

## 用法

1. [创建一个公开仓库](https://github.com/new?name=picg-images-hosting&visibility=public)，例如 `picg-images-hosting`。
2. [创建一个 Fine-grained personal access token](https://github.com/settings/personal-access-tokens/new?name=PiCG&expires_in=90&contents=write)：
   - Repository access：选择 **Only select repositories**，并且只选图床仓库。
   - Repository permissions：把 **Contents** 设为 **Read and write**，其他都保持 **No access**。
3. 打开 PiCG，填入 Token 和仓库名（用逗号或空格分隔；留空即 `picg-images-hosting`），点击 **登录**。PiCG 默认使用每个仓库的默认分支；要用其他分支，写成 `<REPO>@<BRANCH>`，分支不存在时 PiCG 会询问是否创建。之后也可以在 **设置** 中更换分支。建议把默认分支命名为 `gh-pages`，这样 PiCG 和 GitHub Pages 用的是同一个分支；已有仓库的分支可以在它的 **Branches** 页面改名，PiCG 会自动跟上。

登录时会检查 Token。PiCG 会拒绝 Classic token、不能写入所列全部仓库的 Token，以及还能写入你其他仓库的 Token。仓库多时检查其他仓库会很慢，**跳过 Token 安全检查** 只跳过这一部分。空仓库会先建一个 `README.md`，每个仓库都会加一个 `.nojekyll`，让 GitHub Pages 不经 Jekyll 直接提供文件。

Token 以混淆后的形式保存在浏览器的 `localStorage` 中。这只能防止它被一眼看到，并不是加密，因为密钥就在应用里。退出登录时会询问是否在这台设备上保留 Token 和设置。

Note：GitHub 不公开 Fine-grained token 的完整权限列表，所以检查看不到它在图床仓库本身上多给的权限。请保持 **No access**。

## GitHub Pages

要使用 GitHub Pages 链接，需要为每个图床仓库开启一次 GitHub Pages：在仓库中进入 **Settings** > **Pages**，把 **Source** 设为 **Deploy from a branch**，选择 PiCG 使用的分支和 `/ (root)` 目录，点击 **Save**。之后上传的图片会自动出现在 Pages 上，通常几分钟内。

Pages 地址优先取图床分支上的 `CNAME` 文件，其次取 `<OWNER>.github.io` 的 `CNAME`，否则为 `https://<OWNER>.github.io/<REPO>`。设置页可以写入或删除图床仓库的 `CNAME`；域名的 DNS 需要你自己指向 GitHub Pages。

Note：早期的 PiCG 版本通过把图床分支复制到 `gh-pages` 分支来部署，PiCG 已不再更新它。如果图床仓库里还有这个分支，建议删除 `gh-pages`，再把默认分支改名为 `gh-pages`；也可以在 **Settings** > **Pages** 中改为默认分支，并删除 `gh-pages`。在此之前 PiCG 会一直显示提示。

## 设置文件

每个图床仓库的设置保存在其默认分支的 `.picg/settings.toml` 中。最后一次修改 3 秒后，PiCG 写入这个文件，每次写入一个 commit。主题、语言和动效只保存在本机。

PicX（v3.0.x 及之后的版本）或早期 PiCG 版本保存的设置由单独的导入模块读取，并立即使用：包括仓库中图床分支或默认分支上的 `.settings`，以及 PiCG 部署在同一地址时它们存在浏览器里的数据。随后 PiCG 会询问是否用新格式保存并删除旧文件。在你同意之前，它会继续使用导入的设置，但不会把设置写入仓库。

## 部署

`pnpm build` 生成使用相对资源路径和 hash 路由的静态站点，所以 `dist/picg/browser/` 可以放在任何静态托管上，也可以放在子路径下。

`.github/workflows/deploy.yml` 中的 workflow 在每次推送到 `main` 时运行测试、构建站点，并把构建结果直接部署到 GitHub Pages，不经过发布分支：

1. 如果是 fork，先打开 **Actions** 页面启用 workflow。GitHub 在新 fork 上默认关闭它们。
2. 在仓库中进入 **Settings** > **Pages**，把 **Source** 设为 **GitHub Actions**。
3. 要用自己的域名，就在同一页的 **Custom domain** 中填写，并在 `public/CNAME` 中保留同一个域名；否则删除 `public/CNAME`，使用默认的 `github.io` 地址。
4. 推送到 `main`，等待 `deploy` workflow 完成。

Note：请使用 HTTPS。复制链接到剪贴板和 PWA 都需要它。

## 测试

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install --only-shell chromium
pnpm e2e
```

单元测试覆盖设置文件、设置合并、链接规则、文件命名、Token 混淆、元数据去除，以及从 PicX 和早期版本导入设置和 Token。端到端测试在无头 Chromium 中操作构建好的站点，GitHub API 由内存中的模拟实现代替，所以不需要 Token 和仓库，覆盖登录检查（包括被屏蔽和只读的仓库）、上传、重命名、删除、新建和按日期的子文件夹、1000 个文件的上限、可编辑的文件夹路径、设置同步、分支、默认分支改名、转换 PicX 的设置、减少动态效果的设置，以及新版本提示。

冒烟测试对着真实的 GitHub API 跑同样的流程，在测试仓库的一个临时分支上进行，结束后删除该分支：

1. 创建一个只能访问测试仓库的 Fine-grained token，把 **Contents** 设为 **Read and write**。
2. 把它保存到仓库以外的文件中，例如：

   ```bash
   mkdir -p ~/.config/picg && read -rsp 'Token: ' T && printf %s "$T" > ~/.config/picg/e2e-token && chmod 600 ~/.config/picg/e2e-token && echo saved
   ```

   在提示后粘贴 token，屏幕上不会显示。这条命令要等待输入，请在普通终端里运行。

3. 运行：

   ```bash
   PICG_E2E_TOKEN_FILE=~/.config/picg/e2e-token PICG_E2E_REPO=<OWNER>/<REPO> pnpm e2e:real
   ```

   失败时，测试会打印页面内容和失败的请求，并把文本报告保留在 `test-results/real/`，其中的 token 已替换为 `<token>`。
   测试不记录 trace、截图和视频，因为它们都会包含 token。

在 GitHub Actions 中，`CI` workflow 会在每次 push 和 pull request 时运行单元测试和端到端测试。手动触发并勾选 **real** 时，它还会用 `PICG_E2E_TOKEN` secret 和 `PICG_E2E_REPO` 变量运行冒烟测试。

## 兼容性

测试环境：

- 构建：Ubuntu 24.04.4 LTS（Linux 6.8）
  - Node.js 24.22.2
  - pnpm 12.16.1
- 浏览器：Chrome for Testing 156.0.8078.4，无头模式，GitHub API 为模拟

## 免责声明

This project is not affiliated with, endorsed by, or sponsored by PicX or its maintainers. "PicX" refers to the software developed by XPoet (https://github.com/XPoet/picx) and is referenced here solely for descriptive purposes.

## 许可证

Copyright 2026 Tianyu (Sky) Lu

The entire repository is licensed under the Apache License, Version 2.0 
(the "License"); you may not use any file in this repository except in 
compliance with the License. You may obtain a copy of the License at

```plaintext
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## 作者

Tianyu (Sky) Lu
