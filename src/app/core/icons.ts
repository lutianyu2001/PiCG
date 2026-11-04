import { inject, provideAppInitializer } from '@angular/core'
import { MatIconRegistry } from '@angular/material/icon'
import { DomSanitizer } from '@angular/platform-browser'
// The theme button's sun and moon come from Bootstrap Icons (MIT), as on the Apache Airflow site.
import moonStarsFillSvg from 'bootstrap-icons/icons/moon-stars-fill.svg'
import sunFillSvg from 'bootstrap-icons/icons/sun-fill.svg'
import add from '@material-symbols/svg-400/outlined/add.svg'
import arrowBack from '@material-symbols/svg-400/outlined/arrow_back.svg'
import check from '@material-symbols/svg-400/outlined/check.svg'
import checkCircle from '@material-symbols/svg-400/outlined/check_circle.svg'
import chevronLeft from '@material-symbols/svg-400/outlined/chevron_left.svg'
import chevronRight from '@material-symbols/svg-400/outlined/chevron_right.svg'
import close from '@material-symbols/svg-400/outlined/close.svg'
import cloud from '@material-symbols/svg-400/outlined/cloud.svg'
import cloudDone from '@material-symbols/svg-400/outlined/cloud_done.svg'
import cloudUpload from '@material-symbols/svg-400/outlined/cloud_upload.svg'
import construction from '@material-symbols/svg-400/outlined/construction.svg'
import constructionFill from '@material-symbols/svg-400/outlined/construction-fill.svg'
import contentCopy from '@material-symbols/svg-400/outlined/content_copy.svg'
import createNewFolder from '@material-symbols/svg-400/outlined/create_new_folder.svg'
import deleteIcon from '@material-symbols/svg-400/outlined/delete.svg'
import download from '@material-symbols/svg-400/outlined/download.svg'
import edit from '@material-symbols/svg-400/outlined/edit.svg'
import error from '@material-symbols/svg-400/outlined/error.svg'
import folder from '@material-symbols/svg-400/outlined/folder.svg'
import home from '@material-symbols/svg-400/outlined/home.svg'
import image from '@material-symbols/svg-400/outlined/image.svg'
import info from '@material-symbols/svg-400/outlined/info.svg'
import infoFill from '@material-symbols/svg-400/outlined/info-fill.svg'
import key from '@material-symbols/svg-400/outlined/key.svg'
import language from '@material-symbols/svg-400/outlined/language.svg'
import leftPanelClose from '@material-symbols/svg-400/outlined/left_panel_close.svg'
import leftPanelOpen from '@material-symbols/svg-400/outlined/left_panel_open.svg'
import logout from '@material-symbols/svg-400/outlined/logout.svg'
import moreVert from '@material-symbols/svg-400/outlined/more_vert.svg'
import openInNew from '@material-symbols/svg-400/outlined/open_in_new.svg'
import person from '@material-symbols/svg-400/outlined/person.svg'
import personAdd from '@material-symbols/svg-400/outlined/person_add.svg'
import photoLibrary from '@material-symbols/svg-400/outlined/photo_library.svg'
import photoLibraryFill from '@material-symbols/svg-400/outlined/photo_library-fill.svg'
import refresh from '@material-symbols/svg-400/outlined/refresh.svg'
import schedule from '@material-symbols/svg-400/outlined/schedule.svg'
import selectAll from '@material-symbols/svg-400/outlined/select_all.svg'
import settings from '@material-symbols/svg-400/outlined/settings.svg'
import settingsFill from '@material-symbols/svg-400/outlined/settings-fill.svg'
import sync from '@material-symbols/svg-400/outlined/sync.svg'
import syncProblem from '@material-symbols/svg-400/outlined/sync_problem.svg'
import upload from '@material-symbols/svg-400/outlined/upload.svg'
import visibility from '@material-symbols/svg-400/outlined/visibility.svg'
import visibilityOff from '@material-symbols/svg-400/outlined/visibility_off.svg'
import warning from '@material-symbols/svg-400/outlined/warning.svg'

/**
 * Bootstrap Icons draw edge to edge in their 16 px box, where Material Symbols leave a margin. A wider viewBox gives
 * them the same margin: the shape takes 16 of 19.2 units, so 20 px of a 24 px icon, like the others.
 */
const withMargin = (svg: string) =>
  svg.replace('viewBox="0 0 16 16"', 'viewBox="-1.6 -1.6 19.2 19.2"')
const moonStarsFill = withMargin(moonStarsFillSvg)
const sunFill = withMargin(sunFillSvg)

const ICONS: Record<string, string> = {
  add,
  blank: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"></svg>',
  'arrow-back': arrowBack,
  check,
  'check-circle': checkCircle,
  'chevron-left': chevronLeft,
  'chevron-right': chevronRight,
  close,
  cloud,
  'cloud-done': cloudDone,
  'cloud-upload': cloudUpload,
  construction,
  'construction-fill': constructionFill,
  'content-copy': contentCopy,
  'create-new-folder': createNewFolder,
  delete: deleteIcon,
  download,
  edit,
  error,
  folder,
  home,
  image,
  info,
  'info-fill': infoFill,
  key,
  language,
  'left-panel-close': leftPanelClose,
  'left-panel-open': leftPanelOpen,
  logout,
  'more-vert': moreVert,
  'open-in-new': openInNew,
  person,
  'person-add': personAdd,
  'photo-library': photoLibrary,
  'photo-library-fill': photoLibraryFill,
  'moon-stars-fill': moonStarsFill,
  refresh,
  schedule,
  'select-all': selectAll,
  settings,
  'settings-fill': settingsFill,
  sync,
  'sync-problem': syncProblem,
  'sun-fill': sunFill,
  upload,
  visibility,
  'visibility-off': visibilityOff,
  warning
}

/** Registers the Material Symbols used by the app, bundled as SVG text so no icon font is downloaded. */
export const provideIcons = () =>
  provideAppInitializer(() => {
    const registry = inject(MatIconRegistry)
    const sanitizer = inject(DomSanitizer)
    for (const [name, svg] of Object.entries(ICONS)) {
      registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg))
    }
  })
