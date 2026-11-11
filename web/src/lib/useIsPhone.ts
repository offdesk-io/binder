import { useEffect, useState } from 'react'

/** The app's one breakpoint. Below 768px is the phone layout. */
const QUERY = '(max-width: 767px)'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(QUERY)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    on()
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}
