import type { SpineFiles } from '@/pages/Index'

export interface LocalSpineEntry {
  name: string
  /** Unique path key within the dropped tree (e.g. "pack/hero"). */
  path: string
  files: SpineFiles
}

function isSkeletonFile(name: string): boolean {
  return /\.(json|skel)$/i.test(name)
}

function isAtlasFile(name: string): boolean {
  return /\.atlas(\.txt)?$/i.test(name)
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(file.name)
}

export function spineFilesFromFolderFiles(
  files: File[],
  folderPath: string,
  folderName: string,
): LocalSpineEntry | null {
  const skeletonFiles = files.filter((f) => isSkeletonFile(f.name))
  const atlasFile = files.find((f) => isAtlasFile(f.name))
  const imageFiles = files.filter((f) => isImageFile(f))

  if (skeletonFiles.length === 0 || !atlasFile || imageFiles.length === 0) {
    return null
  }

  const spineFiles: SpineFiles = {
    jsonFile: skeletonFiles[0],
    atlasFile,
    imageFiles,
    skeletonFiles: skeletonFiles.length > 1 ? skeletonFiles : undefined,
  }

  return {
    name: folderName,
    path: folderPath,
    files: spineFiles,
  }
}

/** Group dropped files by parent directory using `webkitRelativePath`. */
export function scanSpinesFromWebkitRelativePaths(files: File[]): LocalSpineEntry[] {
  const byDir = new Map<string, File[]>()

  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    if (!rel) continue
    const slash = rel.lastIndexOf('/')
    const dir = slash >= 0 ? rel.slice(0, slash) : ''
    const list = byDir.get(dir) ?? []
    list.push(file)
    byDir.set(dir, list)
  }

  const entries: LocalSpineEntry[] = []
  for (const [dirPath, dirFiles] of byDir) {
    const name = dirPath ? (dirPath.split('/').pop() ?? dirPath) : dirFiles[0]?.name.replace(/\.[^.]+$/, '') ?? 'spine'
    const entry = spineFilesFromFolderFiles(dirFiles, dirPath || name, name)
    if (entry) entries.push(entry)
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all)
            return
          }
          all.push(...batch)
          readBatch()
        },
        (err) => reject(err),
      )
    }
    readBatch()
  })
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

async function listDirectChildren(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return readDirectoryEntries(dir.createReader())
}

/** Walk directory tree; each folder with skel+json+atlas+images becomes one entry. */
export async function scanSpinesFromDirectoryEntry(
  dir: FileSystemDirectoryEntry,
  pathPrefix = dir.name,
): Promise<LocalSpineEntry[]> {
  const children = await listDirectChildren(dir)
  const files: File[] = []
  const subdirs: FileSystemDirectoryEntry[] = []

  for (const child of children) {
    if (child.isFile) {
      files.push(await readFileEntry(child as FileSystemFileEntry))
    } else if (child.isDirectory) {
      subdirs.push(child as FileSystemDirectoryEntry)
    }
  }

  const results: LocalSpineEntry[] = []
  const direct = spineFilesFromFolderFiles(files, pathPrefix, dir.name)
  if (direct) results.push(direct)

  for (const sub of subdirs) {
    const subPath = `${pathPrefix}/${sub.name}`
    results.push(...(await scanSpinesFromDirectoryEntry(sub, subPath)))
  }

  return results
}

function getRootDirectoryEntries(dt: DataTransfer): FileSystemDirectoryEntry[] {
  const roots: FileSystemDirectoryEntry[] = []
  const items = dt.items
  if (!items) return roots
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry?.isDirectory) {
      roots.push(entry as FileSystemDirectoryEntry)
    }
  }
  return roots
}

/** Scan a dropped folder for spine exports in subfolders (Chrome directory reader API). */
export async function scanSpineFoldersFromDataTransfer(dt: DataTransfer): Promise<LocalSpineEntry[]> {
  const relFiles = Array.from(dt.files).filter(
    (f) => !!(f as File & { webkitRelativePath?: string }).webkitRelativePath,
  )
  const fromPaths = scanSpinesFromWebkitRelativePaths(relFiles)
  if (fromPaths.length > 0) {
    return fromPaths
  }

  const roots = getRootDirectoryEntries(dt)
  if (roots.length === 0) return []

  const merged: LocalSpineEntry[] = []
  for (const root of roots) {
    merged.push(...(await scanSpinesFromDirectoryEntry(root)))
  }

  const byPath = new Map<string, LocalSpineEntry>()
  for (const entry of merged) {
    byPath.set(entry.path, entry)
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path))
}

export function isLikelyFolderDrop(dt: DataTransfer): boolean {
  if (getRootDirectoryEntries(dt).length > 0) return true
  return Array.from(dt.files).some((f) => !!(f as File & { webkitRelativePath?: string }).webkitRelativePath)
}
