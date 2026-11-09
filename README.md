<p align="center">
  <img src="./public/logo-tile.svg" alt="PiCG logo" width="96">
</p>

# PiCG

<p align="right">
    <strong>English</strong> | <a href="./README/README_CN.md">中文</a> | <a href="./README/README_JP.md">日本語</a>
</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)<br>
[![CI](https://github.com/lutianyu2001/PiCG/actions/workflows/ci.yml/badge.svg)](https://github.com/lutianyu2001/PiCG/actions/workflows/ci.yml)

A lightweight image host that runs in your browser: it uploads images to your own GitHub repository or Cloudflare R2 bucket and gives you links to them.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Cloudflare R2](#cloudflare-r2)
- [GitHub Pages](#github-pages)
- [Settings File](#settings-file)
- [Deployment](#deployment)
- [Testing](#testing)
- [Compatibility](#compatibility)
- [Disclaimer](#disclaimer)
- [License](#license)
- [Author](#author)

## Overview

PiCG is a static site with no server. It talks to the GitHub REST API with a fine-grained personal access token, or to the S3-compatible API of Cloudflare R2 with an R2 API token, straight from the browser. It stores images as files in a public repository or a bucket, and builds links to them for GitHub, GitHub Pages, a CDN or the bucket's public address. Images are compressed and watermarked in the browser before upload.

PiCG was first planned as a modified fork of the [PicX v3.0.2 release](https://github.com/XPoet/picx/releases/tag/v3.0.2) (commit [d2c5db7](https://github.com/XPoet/picx/commit/d2c5db77901856656a545905208647c95dfff910), 2024-04-30), the last version before the redesign in v3.1.0, but the changes grew until rewriting it from scratch made more sense. It now shares no code with PicX. The only connection, which is not code, is that PiCG stays compatible with PicX's settings files: it reads the settings saved by PicX and by the earlier, PicX-based versions of PiCG, and converts them to its own format.

## Features

- Images kept in GitHub repositories or Cloudflare R2 buckets; a session uses one of the two
- Accounts signed in on the device are remembered and listed on the sign-in page, to sign in again with one click
- One library page per repository or bucket: browse folders through an editable path (click a level to go back, or type a path, with suggestions), and drop, paste or pick images to upload them into the folder you are in; drop on a folder to upload there, or drop a folder to keep its structure
- An upload queue that shows where images go, lets you rename them, and uploads the batch (as one commit on GitHub); optionally uploads right after adding
- Subfolders for uploads: none, a time-based folder with a configurable date-fns format (such as `yyyy/MM`), or a named one
- Content hashes and prefixes in file names
- Each folder of a GitHub repository holds up to 1000 files; an upload that would go past it fails, and failed uploads say why
- Compression to WebP, AVIF or JPEG (MozJPEG) and text watermarks, run in a Web Worker with jSquash
- HEIC and HEIF photos converted on upload; browsers that cannot decode them load libheif (LGPL-3.0), kept as separate files in `heif/` (see [NOTICE](NOTICE))
- Photo metadata such as location removed before upload, keeping orientation and colour profiles
- Rename without re-encoding, delete, properties, multi-select (checkbox, shift-click, long press), batch copy and delete
- Link rules for GitHub, GitHub Pages, jsDelivr, Statically and a jsDelivr mirror, plus your own; copy as a plain link, Markdown, HTML, BBCode or your own format
- GitHub Pages publishes the image branch itself, so nothing needs deploying; PiCG shows whether Pages is on and can set the custom domain
- Several repositories or buckets, each with its own settings in `.picg/settings.toml`, written back a few seconds after each change
- Import from another GitHub repository: copies the images that are not there yet, keeping their paths
- Toolbox for compression, Base64 and watermarks, without signing in
- Simplified Chinese, Traditional Chinese, English and Japanese, with a language button in the top bar
- Light and dark themes; the sun or moon button in the top bar switches between them, and **Settings** can follow the system
- Material 3 motion: pages fade through, folders and images come in one after another; follows the system's reduced-motion setting unless turned on or off in **Settings**
- Open source fonts loaded from jsDelivr, falling back to npmmirror: Inter and Noto Sans (the interface language's CJK font first), with Josefin Sans for Latin titles
- Installable as a PWA, with a bottom navigation bar on phones; a page left open still tells you when a new version is out

## Prerequisites

- A GitHub account, or a Cloudflare account with R2
- To build from source:
  - pnpm 12.16.1, as pinned by `packageManager` in `package.json`
  - Node.js 24.22.2, as pinned by `devEngines.runtime` in `package.json`; pnpm downloads it for the project, so `pnpm` scripts do not use your global Node.js

## Installation

### Using the Hosted Site (Recommended)

Open [https://picg.lu.fm](https://picg.lu.fm). To install it as an app, use the browser's install button in the address bar or menu.

### Building from Source

1. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/lutianyu2001/PiCG.git
   cd PiCG
   pnpm install
   ```

2. Start the development server, or build the site:

   ```bash
   pnpm dev
   pnpm build
   ```

| Command | Description |
|---------|-------------|
| `pnpm dev` | Copy the codec binaries, then serve the app on port 4000 and open it |
| `pnpm build` | Build the site into `dist/picg/browser/` |
| `pnpm serve` | Serve the production build on port 4173 |
| `pnpm wasm` | Copy the jSquash encoder binaries and their licenses from `node_modules/@jsquash` into `public/wasm/`; `dev` and `build` run it first |
| `pnpm test` | Run the unit tests |
| `pnpm e2e` | Run the end-to-end tests in headless Chromium against fake GitHub and R2 APIs (build first) |
| `pnpm e2e:real` | Run the smoke test against the real GitHub API (see [Testing](#testing)) |
| `pnpm typecheck` | Type-check the code and templates |
| `pnpm lint` | Lint with ESLint |

The behaviour of the app is described in [`docs/spec.md`](docs/spec.md).

## Usage

The sign-in page has two tabs, **GitHub** and **Cloudflare R2**. Accounts you have signed in with are listed first; click one to sign in with it again, or **Use another account**. Signing out asks whether to keep the account on the device; otherwise its token or keys and cached settings are removed.

### GitHub

1. [Create a public repository](https://github.com/new?name=picg-images-hosting&visibility=public), for example `picg-images-hosting`.
2. [Create a fine-grained personal access token](https://github.com/settings/personal-access-tokens/new?name=PiCG&expires_in=90&contents=write):
   - Repository access: choose **Only select repositories**, and select only the image repositories.
   - Repository permissions: set **Contents** to **Read and write**. Leave everything else at **No access**.
3. Open PiCG, enter the token and the repository names (separated by commas or spaces; empty means `picg-images-hosting`), and click **Sign in**. PiCG works on each repository's default branch; write `<REPO>@<BRANCH>` to use another branch, which PiCG offers to create if it does not exist. The branch can also be changed later in **Settings**. A default branch named `gh-pages` is recommended, so that PiCG and GitHub Pages use the same branch; an existing repository's branch can be renamed on its **Branches** page, and PiCG follows the rename.

Signing in checks the token. PiCG rejects classic tokens, tokens that cannot write to every listed repository, and tokens that can write to any other repository of yours. Checking the other repositories is slow when you have many; **Skip the token security check** skips that part only. Empty repositories get a `README.md`, and every repository gets a `.nojekyll` so GitHub Pages serves the files without Jekyll.

The token is kept in the browser's `localStorage` in obfuscated form. That only keeps it from being readable at a glance; it is not encryption, because the key ships with the app.

Note: GitHub does not expose the full permission list of a fine-grained token, so the check cannot see extra permissions on the image repositories themselves. Leave them at **No access**.

## Cloudflare R2

1. In the Cloudflare dashboard, create an R2 bucket.
2. In the bucket's **Settings**, connect a custom domain, or turn on its public `r2.dev` address (Cloudflare limits it and does not recommend it for production).
3. In the bucket's **Settings** > **CORS policy**, add the policy shown on the sign-in page (it has a copy button). Without it, the browser blocks every request from PiCG to the bucket. For PiCG at `https://picg.lu.fm`:

   ```json
   [
     {
       "AllowedOrigins": ["https://picg.lu.fm"],
       "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
       "AllowedHeaders": ["authorization", "content-type", "x-amz-content-sha256", "x-amz-date", "x-amz-copy-source", "if-match", "if-none-match"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. Create an R2 API token with **Object Read & Write**, applied to the image bucket only, and copy its **Access Key ID** and **Secret Access Key**.
5. In PiCG, open the **Cloudflare R2** tab, enter the bucket's **S3 API** address as its settings page shows it (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<BUCKET>`), the two keys and the bucket's public address, and click **Sign in**.

Signing in lists the bucket and writes and deletes `.picg/check`, to make sure the keys can read and write. When the browser blocks the request, the message points at the CORS policy. PiCG cannot see whether the token also reaches other buckets, so limit it to the image bucket. More buckets of the same account can be added in **Settings**, each with its own public address.

Links use the public address (`{public}/{path}`), and so do thumbnails. Each upload is its own request and refuses names that are taken, so in a batch some images can fail while the others are uploaded. Rename copies the object and deletes the old one. Importing from another repository and GitHub Pages are GitHub only.

## GitHub Pages

To use GitHub Pages links, turn on GitHub Pages once per image repository: in the repository, go to **Settings** > **Pages**, set **Source** to **Deploy from a branch**, choose the branch PiCG works on and the `/ (root)` folder, and click **Save**. Uploads then appear on Pages by themselves, usually within a few minutes.

The Pages address comes from the `CNAME` file on the image branch, then from the `CNAME` of `<OWNER>.github.io`, and otherwise is `https://<OWNER>.github.io/<REPO>`. The settings page can write or delete the image repository's `CNAME`; pointing the domain's DNS at GitHub Pages is up to you.

Note: Earlier PiCG versions deployed by copying the image branch to a `gh-pages` branch, which PiCG no longer updates. If an image repository still has one, delete `gh-pages` and rename the default branch to `gh-pages` (recommended), or switch **Settings** > **Pages** to the default branch and delete `gh-pages`. PiCG shows a notice until then.

## Settings File

Each image repository keeps its settings in `.picg/settings.toml` on its image branch, and each bucket in `.picg/settings.toml` in the bucket. PiCG writes the file 3 seconds after the last change (on GitHub, one commit per write). Theme, language and motion are kept on the device only.

Settings saved by PicX (v3.0.x and later) or by earlier PiCG versions are read by a separate import module and used right away: `.settings` in the repository, on the image branch or the default branch, and the data they kept in the browser when PiCG is served from the same address. PiCG then asks whether to save them in the new format and delete the old files. Until you agree, it keeps working with the imported settings but does not write settings to the repository.

## Deployment

`pnpm build` produces a static site with relative asset paths and hash routing, so `dist/picg/browser/` can be served from any static host, also under a subpath.

The workflow in `.github/workflows/deploy.yml` runs the tests and builds the site on every push to `main`, and deploys the build straight to GitHub Pages, with no publishing branch:

1. On a fork, open the **Actions** tab and enable workflows. GitHub leaves them off on new forks.
2. In the repository, go to **Settings** > **Pages** and set **Source** to **GitHub Actions**.
3. To use your own domain, enter it under **Custom domain** on the same page and keep it in `public/CNAME`; otherwise delete `public/CNAME` to use the default `github.io` address.
4. Push to `main`, and wait for the `deploy` workflow to finish.

Note: Use HTTPS. Copying links to the clipboard and the PWA both need it.

## Testing

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install --only-shell chromium
pnpm e2e
```

The unit tests cover the settings file, settings merging, link rules, file naming, token obfuscation, metadata removal, and the import of settings and tokens from PicX and earlier versions. The end-to-end tests drive the built site in headless Chromium against in-memory stand-ins for the GitHub API and the R2 API (which checks every request's signature), so they need no token, keys, repository or bucket: sign-in checks (including blocked and read-only repositories, R2 keys that are wrong or cannot write, and a missing CORS policy), uploads, rename, delete, new and dated subfolders, the 1000-file limit, the editable folder path, settings sync, branches, a renamed default branch, remembered accounts, converting PicX settings, the reduced-motion setting, and the notice of a new version.

The smoke test runs the same flow against the real GitHub API, on a temporary branch of a repository that it deletes afterwards:

1. Create a fine-grained token limited to a test repository, with **Contents** set to **Read and write**.
2. Save it to a file of your choice outside the repository, `<TOKEN_FILE>` below:

   ```bash
   read -rsp 'Token: ' T && printf %s "$T" > <TOKEN_FILE> && chmod 600 <TOKEN_FILE> && echo saved
   ```

   Paste the token at the prompt; it is not shown. Run this in an ordinary terminal, since the command waits for
   input.

3. Run it:

   ```bash
   PICG_E2E_TOKEN_FILE=<TOKEN_FILE> PICG_E2E_REPO=<OWNER>/<REPO> pnpm e2e:real
   ```

   On failure, the test prints the page and the failed requests, and keeps its text report in `test-results/real/`,
   with the token replaced by `<token>`. It records no trace, screenshot or video, since each would hold the token.

In GitHub Actions, the `CI` workflow runs the unit and end-to-end tests on every push and pull request. Started by hand with **real** checked, it also runs the smoke test, using the `PICG_E2E_TOKEN` secret and the `PICG_E2E_REPO` variable.
Set them once, in the checkout; the first command asks for the token:

```bash
gh secret set PICG_E2E_TOKEN
gh variable set PICG_E2E_REPO --body <OWNER>/<REPO>
```

Without them, the smoke test is skipped and the run still passes.

## Compatibility

Tested on:

- Build: Ubuntu 24.04.4 LTS (Linux 6.8)
  - Node.js 24.22.2
  - pnpm 12.16.1
- Browser: Chrome for Testing 156.0.8078.4, headless, with the GitHub and R2 APIs mocked

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by PicX or its maintainers. "PicX" refers to the software developed by XPoet (https://github.com/XPoet/picx) and is referenced here solely for descriptive purposes.

## License

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

## Author

Tianyu (Sky) Lu
