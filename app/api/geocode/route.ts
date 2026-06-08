import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const apiKey = process.env.KAKAO_REST_API_KEY
  if (!apiKey) {
    return NextResponse.json({ address: `${lat}, ${lng}` })
  }

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${apiKey}` } },
    )
    const data = await res.json()
    const doc = data.documents?.[0]
    const address =
      doc?.road_address?.address_name ??
      doc?.address?.address_name ??
      `${lat}, ${lng}`
    return NextResponse.json({ address })
  } catch {
    return NextResponse.json({ address: `${lat}, ${lng}` })
  }
}
