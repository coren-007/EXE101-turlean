'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type LType from 'leaflet'
import type { Tutor } from '@/components/tutor-card'
import { formatVnd } from '@/lib/format'
import { MapPin, Plus, Minus, Crosshair, Layers, X } from 'lucide-react'

// Dynamically import Leaflet to avoid SSR issues
let L: typeof LType
let MapContainer: any
let TileLayer: any
let Marker: any
let Popup: any
let useMap: any
let useMapEvents: any
let LayerControl: any
let markerClusterGroup: any

function useLeaflet() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    let mounted = true
    // Import leaflet first, then markercluster (which needs L global)
    import('leaflet').then((leafletModule) => {
      if (!mounted) return
      L = leafletModule.default
      // Expose L globally so markercluster can find it
      ;(window as any).L = L
      // Fix default icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      return Promise.all([
        import('react-leaflet'),
        import('leaflet.markercluster'),
      ]) as any
    }).then(([reactLeaflet, _cluster]: any) => {
      if (!mounted) return
      ;({ MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, LayerControl } = reactLeaflet)
      // markerClusterGroup is attached to L by the cluster plugin
      markerClusterGroup = (L as any).markerClusterGroup
      setReady(true)
    }).catch((err) => {
      console.error('Failed to load leaflet:', err)
    })
    return () => { mounted = false }
  }, [])
  return ready
}

// Build a price bubble marker
function makePriceMarker(price: number, isActive: boolean) {
  return L.divIcon({
    className: 'price-marker-wrap',
    html: `<div class="price-marker ${isActive ? 'is-active' : ''}">${Math.round(price / 1000)}k</div>`,
    iconSize: [40, 24],
    iconAnchor: [20, 24],
    popupAnchor: [0, -22],
  })
}

function makeUserMarker() {
  return L.divIcon({
    className: 'user-marker-wrap',
    html: '<div class="user-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function makePickedMarker() {
  return L.divIcon({
    className: 'price-marker-wrap',
    html: '<div class="price-marker" style="background:#2563eb;border-color:#2563eb;color:#fff;">📍 Đây</div>',
    iconSize: [56, 24],
    iconAnchor: [28, 24],
    popupAnchor: [0, -22],
  })
}

// Auto-fit map to show all markers
function FitBounds({ tutors, userLat, userLng, pickedLat, pickedLng }: {
  tutors: Tutor[]
  userLat?: number
  userLng?: number
  pickedLat?: number
  pickedLng?: number
}) {
  const map = useMap()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    const points: LType.LatLngExpression[] = tutors
      .filter(t => t.lat != null && t.lng != null)
      .map(t => [t.lat!, t.lng!])
    if (userLat != null && userLng != null) points.push([userLat, userLng])
    if (pickedLat != null && pickedLng != null) points.push([pickedLat, pickedLng])
    if (points.length === 0) return

    if (points.length === 1) {
      map.setView(points[0], 13)
    } else {
      const bounds = L.latLngBounds(points as any)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }
    done.current = true
  }, [tutors, userLat, userLng, pickedLat, pickedLng, map])

  return null
}

// Click handler - allow user to click on map to set search location
function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e: any) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Custom zoom controls (top-right)
function CustomControls({ onLocate, onToggleLayer, layer }: {
  onLocate: () => void
  onToggleLayer: () => void
  layer: 'street' | 'satellite'
}) {
  const map = useMap()
  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'none' }}>
      <div className="leaflet-control" style={{ pointerEvents: 'auto', marginTop: '10px', marginRight: '10px' }}>
        <div className="flex flex-col gap-1.5 bg-background rounded-lg shadow-md border p-1">
          <button
            onClick={() => map.zoomIn()}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
            title="Phóng to"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => map.zoomOut()}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
            title="Thu nhỏ"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="h-px bg-border my-0.5" />
          <button
            onClick={onLocate}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted text-primary transition-colors"
            title="Vị trí của tôi"
          >
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleLayer}
            className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${layer === 'satellite' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            title={layer === 'satellite' ? 'Chuyển sang bản đồ thường' : 'Chuyển sang vệ tinh'}
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Cluster layer that re-renders when tutors change
function ClusterLayer({
  tutors,
  selectedId,
  onSelect,
}: {
  tutors: Tutor[]
  selectedId?: string
  onSelect?: (id: string) => void
}) {
  const map = useMap()
  const clusterRef = useRef<any>(null)

  useEffect(() => {
    // Get cluster factory - either from local L or global L
    const clusterFactory = (L as any).markerClusterGroup || (window as any).L?.markerClusterGroup
    if (!clusterFactory) {
      console.warn('markerClusterGroup not available, falling back to plain markers')
      // Fallback: just add markers directly to map
      const markers: any[] = []
      tutors.forEach(t => {
        if (t.lat == null || t.lng == null) return
        const marker = L.marker([t.lat, t.lng], {
          icon: makePriceMarker(t.minPrice, selectedId === t.id),
        })
        marker.bindPopup(`
          <div class="popup-title">${t.name}</div>
          <div class="popup-meta">${t.profession || ''}</div>
          <div class="popup-meta">⭐ ${t.avgRating.toFixed(1)} (${t.reviewCount}) · ${t.district || ''}${t.city ? ', ' + t.city : ''}${t.distanceKm != null ? ' · ' + t.distanceKm + 'km' : ''}</div>
          <div class="popup-price">${formatVnd(t.minPrice)}<span class="text-xs font-normal text-muted-foreground">/giờ</span></div>
        `)
        marker.on('click', () => onSelect?.(t.id))
        marker.addTo(map)
        markers.push(marker)
      })
      return () => {
        markers.forEach(m => map.removeLayer(m))
      }
    }

    const cluster = clusterFactory({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c: any) => {
        const count = c.getChildCount()
        return L.divIcon({
          html: `<div class="custom-cluster">${count}</div>`,
          className: 'custom-cluster-wrap',
          iconSize: [40, 40],
        })
      },
    })
    clusterRef.current = cluster

    tutors.forEach(t => {
      if (t.lat == null || t.lng == null) return
      const marker = L.marker([t.lat, t.lng], {
        icon: makePriceMarker(t.minPrice, selectedId === t.id),
      })
      marker.bindPopup(`
        <div class="popup-title">${t.name}</div>
        <div class="popup-meta">${t.profession || ''}</div>
        <div class="popup-meta">⭐ ${t.avgRating.toFixed(1)} (${t.reviewCount}) · ${t.district || ''}${t.city ? ', ' + t.city : ''}${t.distanceKm != null ? ' · ' + t.distanceKm + 'km' : ''}</div>
        <div class="popup-price">${formatVnd(t.minPrice)}<span class="text-xs font-normal text-muted-foreground">/giờ</span></div>
      `)
      marker.on('click', () => onSelect?.(t.id))
      cluster.addLayer(marker)
    })

    map.addLayer(cluster)
    return () => {
      map.removeLayer(cluster)
      clusterRef.current = null
    }
  }, [tutors, selectedId, onSelect, map])

  return null
}

// Info banner when in pick mode
function PickBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="leaflet-top leaflet-left" style={{ pointerEvents: 'none' }}>
      <div className="leaflet-control" style={{ pointerEvents: 'auto', marginTop: '10px', marginLeft: '10px' }}>
        <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-md flex items-center gap-2 text-xs font-medium">
          <MapPin className="h-3.5 w-3.5" />
          Click vào bản đồ để chọn vị trí tìm kiếm
          <button onClick={onCancel} className="ml-1 hover:bg-primary-foreground/20 rounded p-0.5">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export interface TutorMapProps {
  tutors: Tutor[]
  userLat?: number
  userLng?: number
  onSelect?: (id: string) => void
  selectedId?: string
  // Optional: pick mode - allow click to set location
  pickMode?: boolean
  onPickLocation?: (lat: number, lng: number) => void
  onCancelPick?: () => void
  pickedLat?: number
  pickedLng?: number
  onLocate?: () => void
}

export function TutorMap({
  tutors,
  userLat,
  userLng,
  onSelect,
  selectedId,
  pickMode = false,
  onPickLocation,
  onCancelPick,
  pickedLat,
  pickedLng,
  onLocate,
}: TutorMapProps) {
  const ready = useLeaflet()
  const [layer, setLayer] = useState<'street' | 'satellite'>('street')

  const tutorsWithCoords = useMemo(
    () => tutors.filter(t => t.lat != null && t.lng != null),
    [tutors]
  )

  // Default center: Hanoi
  const defaultCenter: [number, number] = [21.0285, 105.8542]
  const center: [number, number] = pickedLat != null && pickedLng != null
    ? [pickedLat, pickedLng]
    : userLat != null && userLng != null
      ? [userLat, userLng]
      : tutorsWithCoords[0]
        ? [tutorsWithCoords[0].lat!, tutorsWithCoords[0].lng!]
        : defaultCenter

  if (!ready) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
        <div className="text-center">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-xs">Đang tải bản đồ...</p>
        </div>
      </div>
    )
  }

  if (tutorsWithCoords.length === 0 && userLat == null && pickedLat == null) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted text-muted-foreground">
        <MapPin className="h-12 w-12 mb-2 opacity-40" />
        <p className="text-sm">Chưa có dữ liệu vị trí</p>
        <p className="text-xs mt-1">Hãy bật định vị hoặc click vào bản đồ để chọn vị trí</p>
      </div>
    )
  }

  const MapC: any = MapContainer
  return (
    <MapC
      center={center}
      zoom={12}
      scrollWheelZoom={false}
      zoomControl={false}
      className="h-full w-full"
      style={{ background: layer === 'satellite' ? '#1a2a3a' : '#e8eef3' }}
    >
      {layer === 'street' ? (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      ) : (
        <TileLayer
          attribution='&copy; Esri, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      )}

      <FitBounds
        tutors={tutorsWithCoords}
        userLat={userLat}
        userLng={userLng}
        pickedLat={pickedLat}
        pickedLng={pickedLng}
      />

      <ClusterLayer tutors={tutorsWithCoords} selectedId={selectedId} onSelect={onSelect} />

      {/* User location marker (always shown if available) */}
      {userLat != null && userLng != null && (
        <Marker
          position={[userLat, userLng]}
          icon={makeUserMarker()}
          zIndexOffset={2000}
        >
          <Popup>
            <div className="popup-title">📍 Vị trí của bạn</div>
            <div className="popup-meta">{pickMode ? 'Đang chọn vị trí tìm kiếm' : 'Đang lọc gia sư trong bán kính 15km'}</div>
          </Popup>
        </Marker>
      )}

      {/* Picked location marker (when user clicks to set location) */}
      {pickedLat != null && pickedLng != null && (
        <Marker
          position={[pickedLat, pickedLng]}
          icon={makePickedMarker()}
          zIndexOffset={2500}
        >
          <Popup>
            <div className="popup-title">📍 Vị trí đã chọn</div>
            <div className="popup-meta">Đang lọc gia sư trong bán kính 15km từ đây</div>
          </Popup>
        </Marker>
      )}

      {/* Click to pick location */}
      {pickMode && onPickLocation && (
        <ClickHandler onPick={onPickLocation} />
      )}

      {pickMode && onCancelPick && <PickBanner onCancel={onCancelPick} />}

      {/* Custom controls */}
      <CustomControls
        onLocate={() => {
          if (onLocate) onLocate()
        }}
        onToggleLayer={() => setLayer(l => l === 'street' ? 'satellite' : 'street')}
        layer={layer}
      />
    </MapC>
  )
}
