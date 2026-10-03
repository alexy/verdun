/** A serializable, metadata-free local draft. Storage and publishing belong to the app. */
export interface PhotoDraft {
  imageDataUrl: string
  imageAlt: string
}

export interface PhotoPickerOptions {
  photo?: PhotoDraft | null
  onChange(photo: PhotoDraft | null): void
  /** An empty message clears the previous picker error. */
  onError?(message: string): void
  onBusyChange?(busy: boolean): void
}

export interface PhotoPickerController {
  getPhoto(): PhotoDraft | null
  isBusy(): boolean
  destroy(): void
}

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_DRAFT_BYTES = 1024 * 1024
const MAX_EDGE = 2048
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
let pickerSequence = 0

function cleanAlt(value: string): string {
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 240).join('')
}

function restoreDraft(value: PhotoDraft | null | undefined): PhotoDraft | null {
  if (!value || typeof value.imageDataUrl !== 'string' || typeof value.imageAlt !== 'string') return null
  if (value.imageDataUrl.length > Math.ceil(MAX_DRAFT_BYTES / 3) * 4 + 32) return null
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.imageDataUrl)) return null
  return { imageDataUrl: value.imageDataUrl, imageAlt: cleanAlt(value.imageAlt) }
}

async function decodePhoto(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    // Applies EXIF orientation before drawing; drawing then drops metadata.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

async function preparePhoto(file: File): Promise<string> {
  if (!PHOTO_TYPES.has(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo.')
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a photo smaller than 20 MiB.')
  if (!file.size) throw new Error('This photo is empty. Choose another photo.')
  let decoded: Awaited<ReturnType<typeof decodePhoto>>
  try {
    decoded = await decodePhoto(file)
  } catch {
    throw new Error('This photo could not be read. Choose another JPEG, PNG, or WebP photo.')
  }
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 40_000_000) {
      throw new Error('Choose a photo with no more than 40 million pixels.')
    }
    let scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is not available in this browser.')
    for (let sizeAttempt = 0; sizeAttempt < 4; sizeAttempt++) {
      canvas.width = Math.max(1, Math.round(decoded.width * scale))
      canvas.height = Math.max(1, Math.round(decoded.height * scale))
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.88, 0.78, 0.68, 0.58]) {
        const result = canvas.toDataURL('image/jpeg', quality)
        const encoded = result.slice(result.indexOf(',') + 1)
        const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
        if (result.startsWith('data:image/jpeg;base64,') && encoded.length * 3 / 4 - padding <= MAX_DRAFT_BYTES) return result
      }
      scale *= 0.75
    }
    throw new Error('The processed photo is too large. Choose a smaller photo.')
  } finally {
    decoded.close()
  }
}

/** Mount one stable file input with scoped paste/drop, preview, description, and removal. */
export function mountPhotoPicker(host: HTMLElement, options: PhotoPickerOptions): PhotoPickerController {
  const id = `verdun-photo-${++pickerSequence}`
  let photo = restoreDraft(options.photo)
  let busy = false
  let destroyed = false
  let selection = 0
  const listeners = new AbortController()
  const root = document.createElement('div')
  root.className = 'verdun-photo'
  root.tabIndex = 0
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', 'Photo attachment')
  root.innerHTML = `
    <input class="verdun-photo__input" id="${id}-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose photo" aria-describedby="${id}-hint">
    <div class="verdun-photo__actions">
      <button class="verdun-photo__choose" type="button">Add photo</button>
      <button class="verdun-photo__remove" type="button" hidden>Remove photo</button>
    </div>
    <p class="verdun-photo__hint" id="${id}-hint">Choose, drop, or paste a photo. JPEG, PNG, or WebP, up to 20 MiB.</p>
    <p class="verdun-photo__status" role="status" aria-live="polite"></p>
    <p class="verdun-photo__error" role="alert" hidden></p>
    <div class="verdun-photo__preview" hidden>
      <img class="verdun-photo__image" alt="Photo preview">
      <label class="verdun-photo__label" for="${id}-alt">Photo description (optional)</label>
      <input class="verdun-photo__alt" id="${id}-alt" type="text" maxlength="240" placeholder="Describe the photo for people using screen readers">
    </div>`
  host.replaceChildren(root)
  const fileInput = root.querySelector<HTMLInputElement>('.verdun-photo__input')!
  const choose = root.querySelector<HTMLButtonElement>('.verdun-photo__choose')!
  const remove = root.querySelector<HTMLButtonElement>('.verdun-photo__remove')!
  const preview = root.querySelector<HTMLDivElement>('.verdun-photo__preview')!
  const image = root.querySelector<HTMLImageElement>('.verdun-photo__image')!
  const alt = root.querySelector<HTMLInputElement>('.verdun-photo__alt')!
  const status = root.querySelector<HTMLParagraphElement>('.verdun-photo__status')!
  const error = root.querySelector<HTMLParagraphElement>('.verdun-photo__error')!
  const eventOptions = { signal: listeners.signal }
  const snapshot = (): PhotoDraft | null => photo ? { ...photo } : null

  function setError(message: string) {
    error.textContent = message
    error.hidden = !message
    options.onError?.(message)
  }
  function setBusy(value: boolean) {
    if (busy === value) return
    busy = value
    root.setAttribute('aria-busy', String(busy))
    status.textContent = busy ? 'Preparing photo…' : ''
    options.onBusyChange?.(busy)
  }
  function render() {
    choose.textContent = photo ? 'Replace photo' : 'Add photo'
    remove.hidden = !photo && !busy
    preview.hidden = !photo
    if (photo) {
      image.src = photo.imageDataUrl
      image.alt = photo.imageAlt || 'Photo preview'
      alt.value = photo.imageAlt
    } else {
      image.removeAttribute('src')
      alt.value = ''
    }
  }
  async function select(file: File) {
    const current = ++selection
    setError('')
    setBusy(true)
    render()
    try {
      const imageDataUrl = await preparePhoto(file)
      if (destroyed || current !== selection) return
      photo = { imageDataUrl, imageAlt: '' }
      options.onChange(snapshot())
    } catch (failure) {
      if (destroyed || current !== selection) return
      setError(failure instanceof Error ? failure.message : 'This photo could not be read.')
    } finally {
      if (!destroyed && current === selection) {
        setBusy(false)
        render()
      }
    }
  }
  choose.addEventListener('click', () => fileInput.click(), eventOptions)
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // The same file can be selected again after an error or removal.
    if (file) void select(file)
  }, eventOptions)
  remove.addEventListener('click', () => {
    selection++
    photo = null
    setError('')
    setBusy(false)
    render()
    options.onChange(null)
    choose.focus()
  }, eventOptions)
  alt.addEventListener('input', () => {
    if (!photo) return
    photo.imageAlt = cleanAlt(alt.value)
    image.alt = photo.imageAlt || 'Photo preview'
    options.onChange(snapshot())
  }, eventOptions)
  root.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }, eventOptions)
  root.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files[0]
    if (!file) return
    event.preventDefault()
    void select(file)
  }, eventOptions)
  root.addEventListener('paste', (event) => {
    const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith('image/'))
    if (!file) return
    event.preventDefault()
    void select(file)
  }, eventOptions)
  render()

  return {
    getPhoto: snapshot,
    isBusy: () => busy,
    destroy() {
      if (destroyed) return
      destroyed = true
      selection++
      listeners.abort()
      setBusy(false)
      photo = null
      image.removeAttribute('src')
      root.remove()
    },
  }
}
