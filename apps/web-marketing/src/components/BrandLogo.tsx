import type { SVGProps } from 'react';

type BrandLogoProps = SVGProps<SVGSVGElement> & {
  label?: string;
};

export function BrandLogo({ label = 'Lanyard Pharmacy', ...props }: BrandLogoProps) {
  return (
    <svg viewBox="0 0 220 150" role="img" aria-label={label} {...props}>
      <defs>
        <linearGradient
          id="lanyard-logo-teal"
          x1="77"
          x2="142"
          y1="9"
          y2="99"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#18D5BF" />
          <stop offset="1" stopColor="#079A90" />
        </linearGradient>
        <linearGradient
          id="lanyard-logo-blue"
          x1="44"
          x2="88"
          y1="14"
          y2="101"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0069D9" />
          <stop offset="1" stopColor="#003C95" />
        </linearGradient>
      </defs>
      <g transform="translate(52 5)">
        <path
          d="M58 102c-18.4-10.9-32.8-22.3-43.2-34.1C5 56.9 0 45.8 0 34.8 0 16.6 13 3 30.6 3c10.8 0 20.6 5.3 27.4 14.3C64.8 8.3 74.6 3 85.4 3 103 3 116 16.6 116 34.8c0 11-5 22.1-14.8 33.1C90.8 79.7 76.4 91.1 58 102Z"
          fill="url(#lanyard-logo-teal)"
        />
        <path
          d="M57.8 102C39.5 91.1 25.1 79.8 14.8 68 5 56.9 0 45.8 0 34.8 0 16.6 13 3 30.6 3c10.8 0 20.6 5.3 27.4 14.3L57.8 102Z"
          fill="url(#lanyard-logo-blue)"
        />
        <path d="M58 17.3v84.9" stroke="#012A63" strokeOpacity="0.9" strokeWidth="4" />
        <path d="M35 79h46" stroke="#012A63" strokeOpacity="0.9" strokeWidth="4" />
        <path d="M78 32v30M63 47h30" stroke="#09315F" strokeWidth="8" strokeLinecap="square" />
      </g>
      <text
        x="110"
        y="124"
        textAnchor="middle"
        fill="#004AA8"
        fontFamily="Montserrat, Arial, sans-serif"
        fontSize="28"
        fontWeight="800"
        letterSpacing="5"
      >
        LANYARD
      </text>
      <text
        x="110"
        y="142"
        textAnchor="middle"
        fill="#089AAB"
        fontFamily="Montserrat, Arial, sans-serif"
        fontSize="12"
        fontWeight="700"
        letterSpacing="7"
      >
        PHARMACY
      </text>
    </svg>
  );
}
