import { brandInitials } from '../lib/branding'

type BrandMarkProps = {
  name: string
  logoUrl?: string
  className?: string
}

export default function BrandMark({ name, logoUrl, className = 'brand-mark' }: BrandMarkProps) {
  if (logoUrl) {
    return <img className={`${className} brand-mark-img`} src={logoUrl} alt="" />
  }
  return (
    <div className={className} aria-hidden="true">
      <span className="brand-mark-letters">{brandInitials(name)}</span>
    </div>
  )
}
