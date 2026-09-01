(() => {
  const year = document.getElementById('year')
  if (year) year.textContent = String(new Date().getFullYear())

  const toggle = document.querySelector('.nav-toggle')
  const nav = document.getElementById('site-nav')
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open')
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('open')
        toggle.setAttribute('aria-expanded', 'false')
      })
    })
  }

  const reveals = document.querySelectorAll('.reveal')
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' },
    )
    reveals.forEach((el) => io.observe(el))
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'))
  }

  const form = document.querySelector('.contact-form')
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const button = form.querySelector('button[type="submit"]')
      if (!button) return
      const original = button.textContent
      button.textContent = 'Request received — we’ll contact you'
      button.disabled = true
      window.setTimeout(() => {
        button.textContent = original
        button.disabled = false
        form.reset()
      }, 2600)
    })
  }

  const smartSections = document.querySelectorAll('.smart-block[id]')
  const smartNavLinks = document.querySelectorAll('.smart-nav a')
  if (smartSections.length && smartNavLinks.length && 'IntersectionObserver' in window) {
    const navMap = new Map()
    smartNavLinks.forEach((link) => {
      const id = link.getAttribute('href')?.slice(1)
      if (id) navMap.set(id, link)
    })

    const setActive = (id) => {
      smartNavLinks.forEach((link) => link.classList.remove('is-active'))
      const active = navMap.get(id)
      if (active) active.classList.add('is-active')
    }

    const navIo = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-35% 0px -50% 0px', threshold: [0, 0.2, 0.45] },
    )

    smartSections.forEach((section) => navIo.observe(section))
    setActive(smartSections[0].id)
  }
})()
