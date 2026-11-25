// The grid's column-type and file-type icons, drawn with hugeicons (the project's only icon set).
import {
  Calendar03Icon,
  CheckmarkSquare02Icon,
  File01Icon,
  FileAudioIcon,
  FileVideoIcon,
  FileZipIcon,
  GridIcon,
  HashtagIcon,
  Image01Icon,
  LeftToRightListBulletIcon,
  Link01Icon,
  CheckListIcon,
  PresentationBarChart01Icon,
  TextIcon,
  TextWrapIcon,
  ToggleOnIcon,
  FileScriptIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { createElement } from "react"

const make = (icon: IconSvgElement) => {
  function GridCellIcon({ className }: { className?: string }) {
    return createElement(HugeiconsIcon, { icon, strokeWidth: 2, className })
  }
  return GridCellIcon
}

export const BaselineIcon = make(TextIcon)
export const TextInitialIcon = make(TextWrapIcon)
export const HashIcon = make(HashtagIcon)
export const LinkIcon = make(Link01Icon)
export const ToggleRightIcon = make(ToggleOnIcon)
export const CheckSquareIcon = make(CheckmarkSquare02Icon)
export const ListIcon = make(LeftToRightListBulletIcon)
export const ListChecksIcon = make(CheckListIcon)
export const CalendarIcon = make(Calendar03Icon)
export const FileIcon = make(File01Icon)
export const File = FileIcon
export const FileArchive = make(FileZipIcon)
export const FileAudio = make(FileAudioIcon)
export const FileImage = make(Image01Icon)
export const FileSpreadsheet = make(GridIcon)
export const FileText = make(FileScriptIcon)
export const FileVideo = make(FileVideoIcon)
export const Presentation = make(PresentationBarChart01Icon)
