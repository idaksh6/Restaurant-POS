/** Dismiss the inline boot splash from index.html (desktop only). */
export function dismissBootSplash() {
  const el = document.getElementById('mesa-boot-splash')
  if (!el) return
  el.setAttribute('aria-busy', 'false')
  el.classList.add('mesa-boot-out')
  window.setTimeout(() => {
    el.remove()
    document.documentElement.classList.add('mesa-app-ready')
  }, 400)
}

/** Wait until React has painted before hiding the splash. */
export function dismissBootSplashAfterPaint() {
  if (!document.documentElement.classList.contains('mesa-desktop')) return
  requestAnimationFrame(() => {
    requestAnimationFrame(dismissBootSplash)
  })
}
