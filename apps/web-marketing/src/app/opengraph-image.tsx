import { ImageResponse } from 'next/og';

export const alt =
  'Lanyard Pharmacy - genuine medicines, delivery, pickup, and prescription support';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#eefcf8',
        color: '#062f2d',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        padding: 88,
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          background: '#0d9488',
          borderRadius: 999,
          color: 'white',
          display: 'flex',
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 1,
          padding: '14px 28px',
        }}
      >
        LANYARD PHARMACY
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1.08,
          marginTop: 42,
          maxWidth: 900,
          textAlign: 'center',
        }}
      >
        Your trusted neighbourhood pharmacy, online.
      </div>
      <div
        style={{
          color: '#155e75',
          display: 'flex',
          fontSize: 30,
          marginTop: 32,
          textAlign: 'center',
        }}
      >
        Genuine medicines, delivery, pickup, and pharmacist-reviewed prescriptions in Lagos.
      </div>
    </div>,
    size,
  );
}
