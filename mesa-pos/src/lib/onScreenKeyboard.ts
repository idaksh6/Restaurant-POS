/** Open host OS on-screen keyboard when running inside Electron; otherwise false. */
export async function trySystemKeyboard(): Promise<boolean> {
  try {
    const shell = window.mesaShell
    if (!shell?.openKeyboard) return false
    return Boolean(await shell.openKeyboard())
  } catch {
    return false
  }
}

export function insertIntoFocusedField(text: string) {
  const el = document.activeElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false
  }
  if (el.disabled || el.readOnly) return false

  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, next)
  else el.value = next

  const caret = start + text.length
  el.setSelectionRange(caret, caret)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function backspaceFocusedField() {
  const el = document.activeElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false
  }
  if (el.disabled || el.readOnly) return false

  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  let nextStart = start
  let next = el.value
  if (start !== end) {
    next = el.value.slice(0, start) + el.value.slice(end)
  } else if (start > 0) {
    next = el.value.slice(0, start - 1) + el.value.slice(end)
    nextStart = start - 1
  } else {
    return false
  }

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, next)
  else el.value = next

  el.setSelectionRange(nextStart, nextStart)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
