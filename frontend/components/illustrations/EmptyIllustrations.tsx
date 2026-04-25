import React from 'react';

export function FreelancerEmptyIllustration(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" {...props}>
      {/* Abstract document / invoice */}
      <circle cx="100" cy="100" r="90" className="fill-surface-variant opacity-20" />
      <rect x="70" y="60" width="60" height="80" rx="8" className="fill-primary opacity-10 stroke-primary" strokeWidth="4" />
      <path d="M85 85h30" className="stroke-primary" strokeWidth="4" strokeLinecap="round" />
      <path d="M85 105h20" className="stroke-primary" strokeWidth="4" strokeLinecap="round" />
      <path d="M115 130l20 -20" className="stroke-teal-500" strokeWidth="6" strokeLinecap="round" />
      <path d="M125 110l10 0l0 10" className="stroke-teal-500" strokeWidth="6" strokeLinecap="round" strokeJoin="round" />
    </svg>
  );
}

export function LPDiscoveryEmptyIllustration(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" {...props}>
      {/* Abstract search / discovery */}
      <circle cx="100" cy="100" r="90" className="fill-surface-variant opacity-20" />
      <circle cx="90" cy="90" r="30" className="stroke-primary opacity-20" strokeWidth="6" />
      <circle cx="90" cy="90" r="20" className="fill-primary opacity-10 stroke-primary" strokeWidth="4" />
      <path d="M110 110l25 25" className="stroke-teal-500" strokeWidth="8" strokeLinecap="round" />
      <circle cx="140" cy="60" r="8" className="fill-teal-500 opacity-50" />
      <circle cx="60" cy="140" r="12" className="fill-primary opacity-30" />
    </svg>
  );
}

export function LPPortfolioEmptyIllustration(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" {...props}>
      {/* Abstract portfolio chart / growth */}
      <circle cx="100" cy="100" r="90" className="fill-surface-variant opacity-20" />
      <path d="M60 140h80" className="stroke-on-surface-variant opacity-30" strokeWidth="4" strokeLinecap="round" />
      <rect x="70" y="110" width="16" height="30" rx="4" className="fill-primary opacity-30" />
      <rect x="96" y="80" width="16" height="60" rx="4" className="fill-primary opacity-60" />
      <rect x="122" y="60" width="16" height="80" rx="4" className="fill-teal-500" />
      <path d="M60 120l30 -40l20 10l30 -40" className="stroke-primary" strokeWidth="4" strokeLinecap="round" strokeJoin="round" />
    </svg>
  );
}

export function PayerEmptyIllustration(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" {...props}>
      {/* Abstract payment / handshake */}
      <circle cx="100" cy="100" r="90" className="fill-surface-variant opacity-20" />
      <circle cx="100" cy="100" r="45" className="stroke-primary opacity-20" strokeWidth="4" strokeDasharray="8 8" />
      <rect x="80" y="80" width="40" height="40" rx="20" className="fill-primary opacity-10 stroke-primary" strokeWidth="4" />
      <path d="M90 100l8 8l14 -16" className="stroke-teal-500" strokeWidth="4" strokeLinecap="round" strokeJoin="round" />
    </svg>
  );
}

export function NotificationsEmptyIllustration(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" {...props}>
      {/* Abstract bell / alerts */}
      <circle cx="100" cy="100" r="90" className="fill-surface-variant opacity-20" />
      <path d="M100 60c-15 0 -25 10 -25 25v20l-10 15v5h70v-5l-10 -15v-20c0 -15 -10 -25 -25 -25z" className="fill-primary opacity-10 stroke-primary" strokeWidth="4" strokeLinecap="round" strokeJoin="round" />
      <path d="M90 135c0 5 4 10 10 10s10 -5 10 -10" className="stroke-primary" strokeWidth="4" strokeLinecap="round" />
      <circle cx="130" cy="70" r="10" className="fill-teal-500" />
    </svg>
  );
}
