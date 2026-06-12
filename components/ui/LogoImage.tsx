'use client'

export default function LogoImage() {
  return (
    <img
      src="/logo.png"
      alt="SUPERY"
      className="h-10 object-contain"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}
