import { redirect } from 'next/navigation'

export const metadata = { title: 'Geo-Fencing | Kawman ExAct' }

export default function GeoFencingPage() {
  redirect('/field-sales/live-map')
}
