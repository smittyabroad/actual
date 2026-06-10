import { useState } from 'react';

import type { AccountEntity } from '@actual-app/core/types/models';

// Local icons saved in public/icons/banks/ — no network request, checked first.
const LOCAL_ICONS: Array<[string, string]> = [
  ['apple card', '/icons/banks/apple.ico'],
  ['apple cash', '/icons/banks/apple.ico'],
  ['apple', '/icons/banks/apple.ico'],
  ['capital one', '/icons/banks/capitalone.ico'],
  ['chase', '/icons/banks/chase.ico'],
  ['charles schwab', '/icons/banks/schwab.ico'],
  ['schwab', '/icons/banks/schwab.ico'],
  ['citibank', '/icons/banks/citi.ico'],
  ['citi', '/icons/banks/citi.ico'],
  ['coinbase', '/icons/banks/coinbase.ico'],
  ['american express', '/icons/banks/amex.ico'],
  ['amex', '/icons/banks/amex.ico'],
  ['fidelity', '/icons/banks/fidelity.ico'],
  ['gemini', '/icons/banks/gemini.ico'],
  ['robinhood', '/icons/banks/robinhood.ico'],
  ['usaa', '/icons/banks/usaa.ico'],
];

// Fallback: fetch favicon via same-origin proxy → DuckDuckGo.
const BANK_DOMAINS: Array<[string, string]> = [
  ['bank of america', 'bankofamerica.com'],
  ['barclays', 'barclays.com'],
  ['discover', 'discover.com'],
  ['goldman sachs', 'goldmansachs.com'],
  ['hsbc', 'hsbc.com'],
  ['marcus', 'marcus.com'],
  ['navy federal', 'navyfederal.org'],
  ['paypal', 'paypal.com'],
  ['pnc', 'pnc.com'],
  ['sofi', 'sofi.com'],
  ['synchrony', 'synchrony.com'],
  ['td bank', 'td.com'],
  ['us bank', 'usbank.com'],
  ['vanguard', 'vanguard.com'],
  ['venmo', 'venmo.com'],
  ['wells fargo', 'wellsfargo.com'],
];

function getLogoUrl(account: AccountEntity): string | null {
  const haystack = (account.bankName ?? account.name ?? '')
    .toLowerCase()
    .trim();
  for (const [keyword, url] of LOCAL_ICONS) {
    if (haystack.includes(keyword)) return url;
  }
  for (const [keyword, domain] of BANK_DOMAINS) {
    if (haystack.includes(keyword)) return `/favicon-proxy/${domain}`;
  }
  return null;
}

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`;
}

type BankLogoProps = {
  account: AccountEntity;
  size?: number;
};

export function BankLogo({ account, size = 14 }: BankLogoProps) {
  const [failed, setFailed] = useState(false);

  const logoUrl = getLogoUrl(account);

  const initial = (account.name ?? '?')[0].toUpperCase();
  const color = nameToColor(account.name ?? '');

  const sharedStyle = {
    width: size,
    height: size,
    marginRight: 5,
    flexShrink: 0 as const,
  };

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{
          ...sharedStyle,
          borderRadius: 3,
          objectFit: 'contain' as const,
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...sharedStyle,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.6),
        color: 'white',
        fontWeight: 'bold',
        lineHeight: 1,
      }}
    >
      {initial}
    </div>
  );
}
