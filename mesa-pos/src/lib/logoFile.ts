const MAX_FILE_BYTES = 150 * 1024
const MAX_EDGE = 512
const MAX_DATA_URL_CHARS = 180_000

export const LOGO_TOO_LARGE = 'TOO_LARGE'

export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(LOGO_TOO_LARGE)
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Could not read image')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const png = canvas.toDataURL('image/png')
  if (png.length <= MAX_DATA_URL_CHARS) return png

  let quality = 0.84
  let jpeg = canvas.toDataURL('image/jpeg', quality)
  while (jpeg.length > MAX_DATA_URL_CHARS && quality > 0.45) {
    quality -= 0.12
    jpeg = canvas.toDataURL('image/jpeg', quality)
  }
  return jpeg
}
