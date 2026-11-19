import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import type { Vehicle } from '../types';

type MapPanelProps = {
  vehicles: Vehicle[];
  selectedVehicle?: string;
  onSelect?: (id: string) => void;
  compact?: boolean;
};

const routeTrace: [number, number][] = [
  [12.9608, 77.5825], [12.9650, 77.5870], [12.9688, 77.5911],
  [12.9715, 77.5940], [12.9752, 77.5984], [12.9790, 77.6014],
  [12.9842, 77.5981], [12.9894, 77.5892],
];

function Recenter({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, Math.max(map.getZoom(), 13), { duration: 0.7 });
  }, [map, position]);
  return null;
}

function vehicleIcon(vehicle: Vehicle, selected: boolean) {
  const color = vehicle.source === 'device' ? '#55d68b' : '#46d9d1';
  return L.divIcon({
    className: 'vehicle-marker-wrap',
    html: `<div class="vehicle-marker ${selected ? 'selected' : ''}" style="--marker-color:${color}"><span></span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function MapPanel({ vehicles, selectedVehicle, onSelect, compact = false }: MapPanelProps) {
  const selected = vehicles.find((vehicle) => vehicle.id === selectedVehicle) || vehicles[0];
  const focus: [number, number] | null = selected?.last_lat != null && selected.last_lon != null
    ? [selected.last_lat, selected.last_lon]
    : null;

  return (
    <div className={`map-frame ${compact ? 'map-compact' : ''}`}>
      <MapContainer center={[12.9716, 77.5946]} zoom={13} scrollWheelZoom className="safe-map">
        <Recenter position={focus} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Map style: <a href="https://www.openstreetmap.de/karte.html">OpenStreetMap.de</a>'
          url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
        />
        <Polyline positions={routeTrace} pathOptions={{ color: '#46d9d1', weight: 3, opacity: 0.8, dashArray: '5 9' }} />
        {vehicles.filter((vehicle) => vehicle.last_lat != null && vehicle.last_lon != null).map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.last_lat as number, vehicle.last_lon as number]}
            icon={vehicleIcon(vehicle, vehicle.id === selectedVehicle)}
            eventHandlers={{ click: () => onSelect?.(vehicle.id) }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{vehicle.name}</strong>
                <span>{vehicle.id} · {vehicle.last_speed.toFixed(0)} km/h</span>
                <span>{vehicle.source === 'device' ? 'DEVICE-REPORTED' : 'SIMULATED LOCATION'}</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="map-legend">
        <span><i className="legend-dot aqua" /> Simulated</span>
        <span><i className="legend-dot green" /> Device reported</span>
        <span className="map-attribution">Illustrative corridor · no registered route geometry</span>
      </div>
    </div>
  );
}
