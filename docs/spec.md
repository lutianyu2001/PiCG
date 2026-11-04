# PiCG functional specification

PiCG stores images in GitHub repositories or Cloudflare R2 buckets and gives out links to them. It is a static web
app that talks to the GitHub REST API with a fine-grained personal access token, or to the S3-compatible API of R2
with an R2 API token, straight from the browser. This document describes what the app
does. It is the only input for the implementation: the code is written from it and from the documentation of the
libraries and APIs it names.

## 1. Ground rules

- The project is licensed under Apache-2.0. Nothing is copied, ported or translated from PicX or from the `main`
  branch of this repository (which is derived from PicX): no code, no comments, no interface text, no images. Where
  PicX had its own implementation, PiCG uses a third-party library or writes its own from this document.
- Reading the data formats of earlier versions so they can be imported (section 10) is allowed; the importer is
  written from the description of those formats in this document.
- Every dependency must be under a license compatible with Apache-2.0 (MIT, BSD, ISC, Apache-2.0 and the like).
- The PiCG logo (`logo.svg`, `logo-tile.svg`) is the author's own work and is reused.

## 2. Stack

| Concern       | Choice                                                                                         | License         |
| ------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| Framework     | Angular 22, standalone components, signals, zoneless change detection                          | MIT             |
| Components    | Angular Material 3 and CDK                                                                     | MIT             |
| Icons         | `@material-symbols/svg-400`, outlined                                                          | Apache-2.0      |
| Theme icons   | `bootstrap-icons` (`sun-fill`, `moon-stars-fill`, as on the Apache Airflow site)               | MIT             |
| Image codecs  | jSquash (`@jsquash/webp`, `@jsquash/avif`, `@jsquash/jpeg`, `@jsquash/png`, `@jsquash/resize`) | Apache-2.0      |
| Settings file | `smol-toml`                                                                                    | BSD-3-Clause    |
| R2 requests   | `aws4fetch` (AWS Signature Version 4 with Web Crypto)                                          | MIT             |
| Date formats  | `date-fns` (`format`, Unicode tokens such as `yyyy/MM`)                                        | MIT             |
| Offline       | `@angular/service-worker`                                                                      | MIT             |
| Tooling       | pnpm, TypeScript, ESLint, Prettier, Stylelint                                                  | MIT and similar |

Watermarks are drawn with the Canvas API by PiCG's own code. Interface text uses a small translation service of
PiCG's own with one JSON file per language.

## 3. Navigation

| Route                                                        | Page                                           | Needs login                                |
| ------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------ |
| `/login`                                                     | Login                                          | no; a logged-in user is sent to `/library` |
| `/library`                                                   | Library (browse, upload, manage)               | yes                                        |
| `/settings`                                                  | Settings                                       | yes, except the appearance group           |
| `/toolbox/compress`, `/toolbox/base64`, `/toolbox/watermark` | Toolbox                                        | no                                         |
| `/about`                                                     | About: what PiCG is, help, disclaimer, license | no                                         |

`/` goes to `/library` when logged in and to `/login` otherwise. Unknown routes do the same. The app uses hash
routing and relative asset paths so it can be served from any static host and subpath.

Layout: a top bar with the logo and the account menu, and a side navigation (library, toolbox, settings, about)
that can be collapsed. On phones the side navigation becomes a bottom bar.

## 4. Login

A session uses one kind of storage: a GitHub account with its repositories, or an R2 account with its buckets
(section 9). Switching to the other kind means signing out and picking another account, which is one click since
accounts are remembered.

**Remembered accounts.** Every account signed in on this device is remembered, unless it is removed when signing
out. When there are any, the sign-in page lists them first, like choosing a user on Steam: one card per account
(GitHub: avatar, login and repository names; R2: bucket names and the start of the account ID), sorted by last
use. A click signs in with it: the check runs again with the stored token or keys, and if it fails the form opens
filled in with that account and the reason. Each card has a remove button, which asks first and then deletes the
account's token or keys and its cached settings from the device. "Use another account" opens the form; without
remembered accounts the form shows directly.

**Form.** Two tabs, GitHub (the default) and Cloudflare R2 (section 9). The GitHub tab is described below.

One page holds everything needed to sign in. It opens with a greeting, "{greeting}, welcome to PiCG", where the
greeting is picked at random on each visit from those for the time of day (morning from 5:00, afternoon from
12:00, evening from 18:00, late night from 23:00), plus one for Mondays, Fridays and weekends; only the greeting
part is written per greeting. The only logo is the one in the top bar.

1. Short steps with links: create a public repository (default name `picg-images-hosting`), create a fine-grained
   token limited to that repository with Contents read and write.
2. Token field (masked, with a show button).
3. Repository names field: names only, separated by commas or spaces; empty means `picg-images-hosting`. An entry
   `name@branch` works on that branch instead of the default branch; if the branch does not exist, the app offers
   to create it from the default branch. The help text recommends naming the default branch `gh-pages`, so that
   PiCG and GitHub Pages use the same branch.
4. "Skip the token security check" checkbox, which asks for confirmation before it takes effect. The dialog says
   that the obfuscated token in `localStorage` carries little everyday risk, but a token with broad permissions is
   a bad security habit, and that the option exists because checking each repository's permissions one by one is
   slow with many repositories. Buttons: "Never mind" on the left, a red "I understand the risk, continue" on the
   right. Checked, sign-in skips the check of the other repositories.
5. "Sign in" button.

Signing in runs the token check, prepares the repositories and opens the library on the first repository.

**Token check.** Rejected, with a message saying why:

- a classic token (not `github_pat_`);
- a token that cannot write to every listed repository;
- a listed repository that does not exist or is not visible to the token (this keeps the token: it may be a typo);
- a listed repository GitHub has blocked (HTTP 451, for example after a DMCA takedown; keeps the token);
- a token that can write to any repository of the user other than the listed ones. Read access to public
  repositories does not count, nor does a repository GitHub has blocked (HTTP 451, for example after a DMCA notice),
  which nobody can write to. With "skip" checked this step is skipped, the others still run.

A network error or rate limit keeps the token and says so; any other error from GitHub keeps it and shows the HTTP
status, and is never reported as a network error. GitHub does not expose the full permission list of a
fine-grained token, so the check cannot see extra permissions on the listed repositories; the help text says so.

**Preparing repositories.** For each listed repository: if it is empty, create `README.md` (one line saying the
repository holds images managed by PiCG) on the default branch, and create the chosen branch from it if it is
another one; make sure `.nojekyll` exists at the root of the chosen branch (content: a newline). Everything PiCG
reads and writes (images, settings, `CNAME`) is on the chosen branch, the image branch.

**Renamed default branch.** When a repository is opened on its default branch and that branch no longer exists,
PiCG reads the repository's default branch again; if it changed (the branch was renamed on GitHub), PiCG switches
to it, saves that in the session and says so.

**Storage.** Tokens and R2 secret keys are kept in `localStorage` in obfuscated form (not encryption; the key ships
with the app). Logging out asks whether to keep the account on this device (default), so it stays on the sign-in
page, or remove it with its cached settings. Sessions stored by earlier versions become a remembered GitHub
account.

## 5. Library

The library is a file manager for the current repository. The folder being viewed is the upload target.

**Top bar:** repository switcher (the only place to switch), editable path of the current folder (a home button for the root; every level above the last can be
clicked to go back to it; the path can be typed or changed, with suggestions of the folders in the deepest
existing level, and Enter goes there; from the first level that is not a folder on, the text turns red and the
field shows an error, except for a name still being typed that matches suggestions; on phones it takes a row),
then buttons: upload (file picker), new folder, refresh, and a menu with "import from another repository".

**Content:** folders first, then images, as cards. The whole file tree is read with one request (Git trees API,
recursive), so moving between folders needs no further requests. Only image files are shown (by extension: png,
jpg, jpeg, gif, webp, avif, svg, ico, bmp); dotfiles and dot-folders such as `.picg` are hidden. If GitHub cannot
return the whole tree (over 100,000 entries), the page says some files are missing.

**Image card:** thumbnail (click to view large), file name, "copy link" button, and a menu with: copy link,
properties (path, size, dimensions, last commit time, SHA, link to the file on GitHub), rename, delete. When the
link rule is GitHub Pages and the thumbnail fails to load, the card shows "not on GitHub Pages yet".

**Selection:** a checkbox on each card, long press on touch, shift-click for ranges. With a selection, a bar shows
the count, select all, clear, copy links (one per line) and delete. Batch delete is one commit.

**Rename:** keeps the blob (no re-encoding); one commit that adds the new path and removes the old one. Refuses
names that exist.

**New folder:** asks for a name and opens the empty folder. Git cannot store empty folders, so it exists only in
the app until something is uploaded into it, and the page says so.

**Import from another repository:** asks for a repository (`owner/name`) and branch, finds the images in it and
copies the ones not already present into the current repository with one commit, keeping their paths.

### 5.1 Upload queue

Dropping files or folders anywhere on the library, pasting, or using the upload button adds images to the queue.
Dropping onto a folder card targets that folder. Dropping a folder keeps its structure below the target.

The queue is a side panel on wide screens and a bottom sheet on phones. Its header holds:

- the target: `current/path`, and the subfolder choice: **none**, **time-based** (named with the time format from
  settings, for example `2026/11`), or **custom** (a name typed here; slashes make nested folders);
- toggles for compression and watermark for this batch, initialised from settings;
- "Upload" and "Clear".

Each item shows a preview, the final file name (editable inline), size before and after compression, processing
state, and after a failed upload the reason. Its menu has: toggle hash, toggle prefix, remove.

Names: spaces become `-`; the prefix from settings is added when on; with hash on, a short content hash (first 8
hex digits of SHA-256 of the processed bytes) goes before the extension, as `name.1a2b3c4d.webp`. A name that
already exists in the target is refused for that item with a clear reason. A folder holds at most 1000 files of
any kind: when a batch would take a folder past that, every item for that folder fails, saying how many files the
folder has, how many were added and the limit.

Processing before upload, in this order: watermark, then compression. Formats the encoder cannot read (gif, svg,
ico, bmp) are uploaded as they are. Upload waits for processing to finish.

HEIC and HEIF photos are always converted, since most browsers cannot show them: compressed with the chosen
encoder, or to JPEG when compression is off. The browser's own decoder is tried first (Safari has one); otherwise
libheif (LGPL-3.0, via libheif-js) is loaded from separate files in `heif/`, only when such a photo is added. A
HEIC photo that cannot be converted is not uploaded, and its item says why. Its preview is the converted image.

Uploading sends the whole batch as one commit with the Git data API (blobs, tree, commit, ref update). If the ref
update fails because the branch moved, the app fetches the new head and retries once. When done, the uploaded
images appear in the folder, their links are copied to the clipboard (in the selected link format, one per line),
and the queue empties; failed items stay with their reasons.

Setting **upload right after adding** (off by default) starts the upload as soon as items are added and processed.

## 6. Settings

Settings are grouped on one scrolling page:

- **Account and repositories (GitHub):** user, token (masked, replaceable, which reruns the check), list of repositories
  with add and remove (adding reruns the check, and accepts `name@branch`), the branch of each repository (pick an
  existing branch or create one from the current branch), log out.
- **Account and buckets (R2):** account ID, Access Key ID (masked), replace keys (reruns the check), list of
  buckets with their public addresses, which can be edited, with add and remove (adding reruns the check), log
  out.
- **Upload:** upload right after adding; default subfolder choice (none, time-based, custom) and the custom name;
  time format (date-fns tokens, with a live preview and a few presets: `yyyy/MM`, `yyyyMMdd`, `yyyy/MM/dd`);
  whether new queue items get a hash; whether they get the prefix, and its text; whether to remove metadata (on by
  default): EXIF, XMP, IPTC and text chunks are removed from JPEG, PNG and WebP files that are uploaded without
  re-encoding, keeping colour profiles and, for JPEG, a non-default orientation. Re-encoded images carry no
  metadata anyway.
- **Compression:** whether new batches are compressed; encoder (WebP, AVIF, MozJPEG); quality.
- **Watermark:** whether new batches get a watermark; text, size, color, opacity, position (four corners and
  center), with a preview.
- **Links:** link rule (section 7), link format (section 7), and for GitHub the Pages status and custom domain
  (section 8).
- **Appearance (this device only):** theme (system, light, dark), language (system, 简体中文, 繁體中文, English, 日本語),
  motion (system, on, off).

### 6.1 Where settings live

- Appearance is stored only in `localStorage` of the device.
- Everything else (except account data) is stored per image repository in `.picg/settings.toml` on its image
  branch, or per bucket in `.picg/settings.toml` in the bucket, and cached in `localStorage`.
- On opening a repository the app reads its settings file; the file wins over the cache. A repository without a
  settings file starts with the current settings and gets the file on the first change.
- Every change is written back after a debounce of 3 seconds, as one commit per write
  (`Update settings via PiCG`). If the write fails because the file changed elsewhere, the app reads the new
  version, applies the changed keys on top of it and writes again once; if that fails it shows an error and keeps
  the local change for the next attempt.

### 6.2 Settings file

TOML, written by the app (comments are not preserved). Unknown keys are kept when rewriting. Example with the
defaults:

```toml
version = 1

[upload]
auto_upload = false
subfolder = "none"        # none | time | custom
custom_subfolder = ""
time_format = "yyyy/MM"
hash = true
prefix_enabled = false
prefix = ""
strip_metadata = true

[compress]
enabled = true
encoder = "webp"          # webp | avif | mozjpeg
quality = 80

[watermark]
enabled = false
text = "PiCG"
size = 32                 # px at 1000 px image width, scaled with the image
color = "#ffffff"
opacity = 0.5
position = "bottom-right" # top-left | top-right | bottom-left | bottom-right | center

[link]
rule = "github"           # id of a preset or custom rule
format = "url"            # url | markdown | html | bbcode | id of a custom format

[[link.rules]]            # custom rules only; presets are built in
id = "my-cdn"
name = "My CDN"
template = "https://img.example.com/{path}"

[[link.formats]]          # custom formats only
id = "rst"
name = "reStructuredText"
template = ".. image:: {url}"
```

## 7. Links

**Rules** turn a file into a URL. Placeholders: `{owner}`, `{repo}`, `{branch}`, `{path}` (URL-encoded per
segment). Built-in rules:

| id           | Name                    | Template                                                        |
| ------------ | ----------------------- | --------------------------------------------------------------- |
| `github`     | GitHub                  | `https://github.com/{owner}/{repo}/raw/{branch}/{path}`         |
| `pages`      | GitHub Pages            | `{pages}/{path}`, where `{pages}` is the Pages base (section 8) |
| `jsdelivr`   | jsDelivr                | `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}`    |
| `statically` | Statically              | `https://cdn.statically.io/gh/{owner}/{repo}@{branch}/{path}`   |
| `jsdmirror`  | jsDelivr mirror (China) | `https://cdn.jsdmirror.com/gh/{owner}/{repo}@{branch}/{path}`   |

For an R2 bucket the only built-in rule is `r2` (Cloudflare R2, `{public}/{path}`, where `{public}` is the
bucket's public address), and the GitHub rules are not offered; the placeholders are `{bucket}`, `{public}` and
`{path}`.

Custom rules can be added, edited and removed; a template must contain `{path}` and start with `https://`.

**Formats** wrap the URL: `url` (the URL alone), `markdown` (`![{name}]({url})`), `html`
(`<img src="{url}" alt="{name}">`), `bbcode` (`[img]{url}[/img]`), plus custom formats with `{url}` and `{name}`
(file name without extension).

## 8. GitHub Pages

GitHub Pages publishes the image branch itself; there is no deploy step.

- Status comes from `has_pages` in the repository data (needs only Metadata permission).
- Not on: settings and library (when the Pages rule is selected) explain how to turn it on (Settings > Pages,
  Deploy from a branch, the image branch, `/ (root)`), with a link to that settings page. The Pages rule cannot be
  selected while Pages is off.
- A `gh-pages` branch exists that is neither the image branch nor the default branch: a notice says earlier
  versions published that branch and PiCG no longer updates it, and recommends deleting it and renaming the image
  branch to `gh-pages`, or else switching Pages to the image branch and deleting `gh-pages`. When Pages is on, the notice says that
  Pages must publish the image branch, since `has_pages` does not say which branch is published.
- Base URL: the domain in `CNAME` on the image branch; else `https://{domain}/{repo}` where `{domain}` is in the
  `CNAME` of `{owner}.github.io`; else `https://{owner}.github.io/{repo}`.
- The custom domain can be set or cleared in settings, which writes or deletes `CNAME` on the image branch. DNS is
  the user's job, and the text says so. Without a domain of its own, the field shows `{domain}/{repo}` of the main
  site in grey as its placeholder, the address links then use.
- Status is checked on start, on opening settings and on switching repositories.

## 9. Cloudflare R2

PiCG can keep images in Cloudflare R2 buckets instead of GitHub repositories. It uses the S3-compatible API of R2,
`https://{account_id}.r2.cloudflarestorage.com` (or a jurisdiction endpoint such as
`https://{account_id}.eu.r2.cloudflarestorage.com`), with requests signed by AWS Signature Version 4 (region
`auto`, service `s3`) from an R2 API token's Access Key ID and Secret Access Key. The Cloudflare REST API is not
used.

**Sign-in tab.** Short steps with links: create a bucket; connect a custom domain to it, or turn on its `r2.dev`
address (which Cloudflare limits and does not recommend for production); add a CORS policy (section below) in the
bucket's settings; create an R2 API token with Object Read & Write, limited to the bucket. Fields:

1. S3 API address, as the bucket's settings page shows it: `https://{account_id}.r2.cloudflarestorage.com/{bucket}`.
   The endpoint and the bucket name are taken from it.
2. Access Key ID and Secret Access Key (masked, with a show button).
3. Public address: the bucket's custom domain or `r2.dev` address, starting with `https://`. It is required:
   links and thumbnails use it.

**CORS policy.** Browsers block requests to the bucket unless its CORS policy allows PiCG's origin, and PiCG
cannot set the policy itself before it is allowed. The sign-in tab shows the policy to paste into the dashboard
(bucket > Settings > CORS policy) with a copy button, filled in with the origin PiCG runs on:

```json
[
  {
    "AllowedOrigins": ["https://picg.lu.fm"],
    "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
    "AllowedHeaders": [
      "authorization",
      "content-type",
      "x-amz-content-sha256",
      "x-amz-date",
      "x-amz-copy-source",
      "if-match",
      "if-none-match"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Check at sign-in.** Rejected, with a message saying why:

- an address that is not an R2 S3 API address with a bucket name;
- a request the browser blocks or that does not reach R2: most likely the CORS policy is missing or does not list
  this origin, and the message says so with the policy (or that the device is offline, when it is);
- keys R2 does not accept (the Secret Access Key is cleared);
- a bucket that does not exist, or that the keys cannot read;
- keys that cannot write: PiCG writes `.picg/check` and deletes it again.

Whether the token can also reach other buckets cannot be checked (a bucket-scoped token cannot list buckets, and
the account-level API sends no CORS headers), so the help text asks for a token limited to the bucket.

**More buckets.** Settings can add buckets reachable with the same keys, each with its own public address. The
library switches between them as it does between repositories.

**Library on R2.**

- The bucket is listed with ListObjectsV2, 1000 keys per request, up to 100,000 objects; past that the page says
  some files are missing. Keys ending in `/` (folders made in the Cloudflare dashboard) are folders. Images and
  hidden paths are picked as for repositories.
- Uploading puts each image with its own request, with `If-None-Match: *` (so a name taken in the meantime is
  refused) and the image's Content-Type, four at a time. Each item succeeds or fails on its own; the links of the
  uploaded ones are copied. The 1000-file folder limit is a GitHub one and does not apply.
- Rename copies the object to the new key and deletes the old one; if the delete fails, both exist and the
  message says so. Delete removes each object with its own request, six at a time, and reports how many failed.
- New folders exist only in the app until something is uploaded into them, as with Git.
- Properties: path, size, dimensions, last modified time and ETag.
- Thumbnails and the preview load from the public address; when a thumbnail fails, the card says the image is not
  reachable at the public address.
- Import from another repository (section 5), GitHub Pages (section 8) and the import from earlier versions
  (section 10) are GitHub only and not shown.

**Settings** live in `.picg/settings.toml` in the bucket, in the format of section 6.2. A write sends `If-Match`
with the ETag last read, or `If-None-Match: *` when there was no file; a 412 answer means the file changed
elsewhere and is handled as in section 6.1. A new bucket's link rule is `r2`.

**Errors** are mapped to the same kinds as GitHub's (unauthorized, forbidden, not found, conflict for 412, server,
network), plus "blocked by the browser" for requests that fail before an answer arrives.

## 10. Importing data from PicX and earlier versions

A separate module, `legacy`, detects data written by PicX (https://github.com/XPoet/picx, both v3.0.x and the
later versions up to v3.2.1) and by earlier PiCG versions, which were based on PicX v3.0.2. It translates the data
into the current model and removes PiCG's own old data when the user agrees. Nothing else in the app reads the old
formats.

### 10.1 What it reads

Browser storage of the same origin. Browser storage is per site, so PicX data is only there when PiCG is served
from the address PicX was served from. Each key is looked up with three prefixes, most recent first: `PICG_`
(earlier PiCG), `PICX_IH_` (PicX from v3.1.0), `PICX_` (PicX up to v3.0.x). The first one found is used.

| Key (after the prefix) | Storage | Content (JSON)                                                                                              | Used for                                  |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `CONFIG`               | local   | `token`, `owner`, `repo`, `branch`; earlier PiCG also `repoList` (`[{name, branch}]`); plus directory state | prefill login: token and repository names |
| `AUTHORIZATION`        | local   | `manualToken`, and for PicX GitHub App logins `token`                                                       | token when `CONFIG` has none              |
| `SETTINGS`             | local   | settings model (9.2)                                                                                        | settings when the repository has none     |
| `MANAGEMENT`           | local   | directory cache                                                                                             | ignored                                   |
| `GLOBAL_SETTINGS`      | session | `language`, `theme`, `folded`                                                                               | appearance, sidebar                       |

Tokens of earlier PiCG are obfuscated (9.3); PicX keeps them as plain text. A PicX repository is prefilled as
`repo@branch`, since PicX works on one configured branch; earlier PiCG always used the default branch. A GitHub App
token from a PicX OAuth login is prefilled too and then rejected by the token check like any non-fine-grained token.
After a conversion only the `PICG_` keys are removed; PicX's keys belong to PicX and are left alone.

Image repository: `.settings` (settings model, 9.2) and `.deploy` (obsolete deploy status, ignored), looked up on
the image branch and then on the default branch: PicX up to v3.0.x always read and wrote `.settings` on the default
branch, and later versions read `.deploy` there. Later PicX writes `.settings` as UTF-8 JSON in Base64; PicX up to
v3.0.x encoded the JSON without UTF-8, so a file that is not valid UTF-8 is read as Latin-1.

### 10.2 Settings model and translation

The same model is used by both PicX versions and by earlier PiCG; later PicX added fields, marked below.

| Old field                                                                                      | New key                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imageName.enableHash`                                                                         | `upload.hash`                                                                                                                                                                               |
| `imageName.addPrefix.enable` / `.prefix`                                                       | `upload.prefix_enabled` / `upload.prefix`                                                                                                                                                   |
| `compress.enable`                                                                              | `compress.enabled`                                                                                                                                                                          |
| `compress.encoder`: `webP`, `avif`, `mozJPEG`                                                  | `compress.encoder`: `webp`, `avif`, `mozjpeg`                                                                                                                                               |
| `compress.encoder`: `original`, `png` (later PicX)                                             | `compress.enabled = false`: PiCG then uploads in the original format                                                                                                                        |
| `watermark.enable`, `.text`, `.textColor`, `.opacity`                                          | `watermark.enabled`, `.text`, `.color`, `.opacity`                                                                                                                                          |
| `watermark.fontSize` (px on the image)                                                         | `watermark.size`, kept as is                                                                                                                                                                |
| `watermark.position`: `leftTop`, `rightTop`, `leftBottom`, `rightBottom`, `fullScreen` (later) | `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`                                                                                                                            |
| `imageLinkType.selected` (rule name)                                                           | `link.rule`: `GitHub` → `github`, `GitHub Pages` → `pages`, `jsDelivr` → `jsdelivr`, `Statically` → `statically`, `ChinaJsDelivr` → `jsdmirror`, other names → the custom rule made from it |
| `imageLinkType.presetList` (map of `{id, name, rule, editable?}`)                              | entries whose name is not built in become `link.rules`; `{{owner}}`, `{{repo}}`, `{{branch}}`, `{{path}}` become single-brace placeholders                                                  |
| `imageLinkFormat.enable` false                                                                 | `link.format = "url"`                                                                                                                                                                       |
| `imageLinkFormat.selected` with `enable` true                                                  | `Markdown` → `markdown`, `HTML` → `html`, `BBCode` → `bbcode`, other names → the custom format made from it                                                                                 |
| `imageLinkFormat.presetList` (`[{name, format}]`)                                              | entries not built in become `link.formats`; `imageLink` → `{url}`, `imageName` → `{name}`                                                                                                   |

Ignored fields: `imageName.enableTimestamp`, `management.sort`, `deploy.customDomain` (later PicX also writes it to
`CNAME`, which PiCG reads), `watermark.rotate`, `watermark.gap`, `starred`, `showAnnouncement`. Missing or malformed
fields fall back to defaults; the import never fails as a whole.

### 10.3 Old token obfuscation

Values start with `obs1:`; the rest is Base64 of an 8-byte random IV followed by the token bytes XORed with a
keystream. Keystream: start with the 32-bit FNV-1a offset basis `0x811c9dc5`; for each byte of the UTF-8 string
`picg-token-obscure-v1` followed by the IV bytes, `state = (state XOR byte) * 0x01000193` (32-bit multiply); if the
state is 0 use 1. Each keystream byte comes from one xorshift32 step (`s ^= s << 13; s ^= s >>> 17; s ^= s << 5`)
and is the low 8 bits of the state. A value without the prefix is plain text.

### 10.4 Flow

1. After login, or on opening a repository that has `.settings` but no `.picg/settings.toml`, the module
   translates the old data and the app uses the result right away.
2. A dialog lists what was found, with the branch of each file, and asks: "Save in the new format and delete the
   old data?"
   - **Yes:** one commit on the image branch writes `.picg/settings.toml` and deletes the old files found there;
     old files found on the default branch are deleted there with one more commit each; PiCG's old browser keys
     are removed.
   - **Not now:** the app keeps working with the translated settings, but settings are not written to the
     repository. A banner on the settings page says so and offers the conversion; the dialog comes back on the next
     start.
3. Browser data with no repository data is converted without asking once the user has logged in, since nothing
   leaves the device.

## 11. Toolbox

Works without login and never touches GitHub.

- **Compress:** pick or drop images, choose encoder and quality, see sizes before and after, download one or all.
- **To Base64:** pick or paste an image, copy the data URL.
- **Watermark:** same options as the upload watermark, preview, download.

## 12. Interface text and accessibility

- Languages: Simplified Chinese, Traditional Chinese with Taiwan wording, English, Japanese. Follows the browser by
  default. The top bar has a language menu and a theme button, which switches between light and dark and shows
  the theme in use as a sun or a moon (following the system is chosen in settings, and is the default).
- Texts the user settled for the PicX-based PiCG (such as the skip-check dialog and the disclaimer) are kept;
  nothing is taken from PicX.
- The disclaimer (provided as is, no responsibility for lost data, leaked tokens or other damage, no guarantee that
  the code is 100% secure, use at your own risk) is shown on the About page.
- The sign-in page is one card: one column up to 34rem wide; where the page is at least 48rem wide, the steps go
  on the left and the form on the right, up to 80rem.
- No keyboard shortcuts of PiCG's own; the image preview has previous and next buttons.
- Placeholders are greyer than typed text (38% of the text colour). On phones, toasts sit above the bottom bar.
- Every icon button has a label; dialogs trap focus; the queue and selection bar work with the keyboard.
- Light and dark themes from Material 3 tokens.
- Motion, with Material 3 durations and easing, and no `@angular/animations` (deprecated): Material's own
  animations and ripples (also on the navigation, folders and image thumbnails); changing pages fades the content
  through with the router's view transitions while the top bar and navigation stay; a change of theme or language
  cross-fades the window; `animate.enter` / `animate.leave` bring in folders and images one after another, notices,
  errors, results, the selection bar, the queue panel and its items (which slide out when removed), and fade the
  preview between images. Motion follows the system by default, so nothing moves when the system asks for reduced
  motion (Material does the same); the setting can turn it on or off for the device, and then also tells Material.
- Fonts (Fontsource variable fonts, from a CDN, not bundled): Inter for text, Josefin Sans for titles (the Material
  brand family), Noto Sans SC, TC and JP for CJK with the interface language's font first. Loaded from jsDelivr;
  if the stylesheet or the first font does not arrive within 3 seconds, from npmmirror instead. Stylesheets carry
  integrity hashes (the same files on both). System fonts until they arrive; the service worker caches them.

## 13. Offline and deployment

- Installable PWA; the app shell works offline, API calls need the network. The service worker looks for a new
  version when the app is opened, every ten minutes while it stays open and whenever it comes back into view (as
  PicX did); once one has been downloaded, a toast offers to reload.
- The app is built with `pnpm build` into `dist/`. A GitHub Actions workflow builds it on pushes to `main` and
  deploys the build straight to GitHub Pages (Pages source: GitHub Actions, no publishing branch); the domain is set
  in the Pages settings and kept in `public/CNAME`.

## 14. Milestones

1. Skeleton: project, lint and format setup, license files, layout and navigation, translation service, themes.
2. GitHub client and login: token check, repository preparation, token storage, logout.
3. Library: browsing, image cards, properties, rename, delete, selection, new folder.
4. Upload queue: adding, naming, subfolders, compression, watermark, batch commit, link copying.
5. Settings: page, per-repository TOML file, debounced sync.
6. Links and GitHub Pages.
7. Legacy import module.
8. Toolbox, import from another repository, PWA, deployment workflow, README.
9. Cloudflare R2: one storage interface for repositories and buckets, the R2 client and its fake for the
   end-to-end tests, the R2 sign-in tab and remembered accounts, R2 settings and links.
10. Later: importing and syncing images between GitHub repositories and R2 buckets, in both directions.
