import { useEffect, useState, type RefObject } from 'react'

const MOBILE_MQ = '(max-width: 960px)'

export type QuickServeMobileTab = 'menu' | 'ticket'

export function useQuickServeLayout(rootRef: RefObject<HTMLDivElement | null>) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false,
  )
  const [mobileTab, setMobileTab] = useState<QuickServeMobileTab>('menu')

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ)
    const onChange = () => {
      setIsMobile(mq.matches)
      if (!mq.matches) setMobileTab('menu')
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const header = root.querySelector('.zk-dash-header')
    const footer = root.querySelector('.zk-hub-foot')
    const cart = root.querySelector('.qs-mobile-cart')

    const syncLayoutVars = () => {
      if (!isMobile) {
        root.classList.remove('qs-mobile')
        root.style.removeProperty('--qs-head-h')
        root.style.removeProperty('--qs-foot-h')
        root.style.removeProperty('--qs-cart-h')
        document.documentElement.style.removeProperty('--qs-head-h')
        document.documentElement.style.removeProperty('--qs-foot-h')
        document.documentElement.style.removeProperty('--qs-cart-h')
        return
      }

      root.classList.add('qs-mobile')
      const headH = header?.getBoundingClientRect().height ?? 0
      const footH = footer?.getBoundingClientRect().height ?? 0
      const cartH = cart?.getBoundingClientRect().height ?? 0

      root.style.setProperty('--qs-head-h', `${headH}px`)
      root.style.setProperty('--qs-foot-h', `${footH}px`)
      root.style.setProperty('--qs-cart-h', `${cartH}px`)
      document.documentElement.style.setProperty('--qs-head-h', `${headH}px`)
      document.documentElement.style.setProperty('--qs-foot-h', `${footH}px`)
      document.documentElement.style.setProperty('--qs-cart-h', `${cartH}px`)
    }

    syncLayoutVars()
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(syncLayoutVars)
        : null
    if (header) ro?.observe(header)
    if (footer) ro?.observe(footer)
    if (cart) ro?.observe(cart)

    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            syncLayoutVars()
            const nextCart = root.querySelector('.qs-mobile-cart')
            if (nextCart && ro) ro.observe(nextCart)
          })
        : null
    mo?.observe(root, { childList: true, subtree: true })

    window.addEventListener('resize', syncLayoutVars)
    window.addEventListener('orientationchange', syncLayoutVars)

    return () => {
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', syncLayoutVars)
      window.removeEventListener('orientationchange', syncLayoutVars)
      root.classList.remove('qs-mobile')
    }
  }, [isMobile, rootRef])

  return { isMobile, mobileTab, setMobileTab }
}
