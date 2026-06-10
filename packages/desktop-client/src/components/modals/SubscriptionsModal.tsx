import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type {
  AccountEntity,
  PayeeEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';

// ─── Known subscription services ─────────────────────────────────────────────
// Each entry: [keyword(s) to match in payee name, display name, favicon domain]
const KNOWN_SERVICES: Array<{
  keywords: string[];
  name: string;
  domain: string;
}> = [
  { keywords: ['netflix'], name: 'Netflix', domain: 'netflix.com' },
  { keywords: ['spotify'], name: 'Spotify', domain: 'spotify.com' },
  {
    keywords: ['hbo max', 'hbomax', 'max.com', 'hbo'],
    name: 'Max (HBO)',
    domain: 'max.com',
  },
  { keywords: ['hulu'], name: 'Hulu', domain: 'hulu.com' },
  {
    keywords: ['disney+', 'disney plus', 'disneyplus'],
    name: 'Disney+',
    domain: 'disneyplus.com',
  },
  {
    keywords: [
      'apple one',
      'apple tv',
      'apple music',
      'icloud',
      'apple.com/bill',
      'apple services',
    ],
    name: 'Apple Services',
    domain: 'apple.com',
  },
  {
    keywords: ['youtube premium', 'youtube music'],
    name: 'YouTube Premium',
    domain: 'youtube.com',
  },
  {
    keywords: ['google one', 'google storage'],
    name: 'Google One',
    domain: 'one.google.com',
  },
  {
    keywords: ['amazon prime', 'prime video', 'amazon.com*prime'],
    name: 'Amazon Prime',
    domain: 'amazon.com',
  },
  {
    keywords: ['microsoft 365', 'office 365', 'microsoft*365'],
    name: 'Microsoft 365',
    domain: 'microsoft.com',
  },
  {
    keywords: ['adobe', 'adobe*creative', 'adobe systems'],
    name: 'Adobe',
    domain: 'adobe.com',
  },
  { keywords: ['dropbox'], name: 'Dropbox', domain: 'dropbox.com' },
  {
    keywords: ['1password', 'onepassword'],
    name: '1Password',
    domain: '1password.com',
  },
  { keywords: ['lastpass'], name: 'LastPass', domain: 'lastpass.com' },
  {
    keywords: ['peacock', 'peacocktv'],
    name: 'Peacock',
    domain: 'peacocktv.com',
  },
  {
    keywords: ['paramount+', 'paramount plus'],
    name: 'Paramount+',
    domain: 'paramountplus.com',
  },
  { keywords: ['espn+', 'espn plus'], name: 'ESPN+', domain: 'espnplus.com' },
  { keywords: ['starz'], name: 'Starz', domain: 'starz.com' },
  { keywords: ['showtime'], name: 'Showtime', domain: 'showtime.com' },
  { keywords: ['crunchyroll'], name: 'Crunchyroll', domain: 'crunchyroll.com' },
  { keywords: ['audible'], name: 'Audible', domain: 'audible.com' },
  {
    keywords: ['kindle unlimited'],
    name: 'Kindle Unlimited',
    domain: 'amazon.com',
  },
  {
    keywords: ['xbox', 'game pass'],
    name: 'Xbox Game Pass',
    domain: 'xbox.com',
  },
  {
    keywords: ['playstation', 'ps now', 'ps plus'],
    name: 'PlayStation Plus',
    domain: 'playstation.com',
  },
  {
    keywords: ['nintendo', 'nintendo online'],
    name: 'Nintendo Online',
    domain: 'nintendo.com',
  },
  { keywords: ['twitch'], name: 'Twitch', domain: 'twitch.tv' },
  { keywords: ['headspace'], name: 'Headspace', domain: 'headspace.com' },
  { keywords: ['calm'], name: 'Calm', domain: 'calm.com' },
  { keywords: ['duolingo'], name: 'Duolingo', domain: 'duolingo.com' },
  { keywords: ['peloton'], name: 'Peloton', domain: 'onepeloton.com' },
  { keywords: ['grammarly'], name: 'Grammarly', domain: 'grammarly.com' },
  { keywords: ['notion'], name: 'Notion', domain: 'notion.so' },
  { keywords: ['slack'], name: 'Slack', domain: 'slack.com' },
  { keywords: ['github'], name: 'GitHub', domain: 'github.com' },
  { keywords: ['figma'], name: 'Figma', domain: 'figma.com' },
  { keywords: ['canva'], name: 'Canva', domain: 'canva.com' },
  {
    keywords: ['expressvpn', 'express vpn'],
    name: 'ExpressVPN',
    domain: 'expressvpn.com',
  },
  { keywords: ['nordvpn', 'nord vpn'], name: 'NordVPN', domain: 'nordvpn.com' },
  {
    keywords: ['proton', 'protonmail', 'protonvpn'],
    name: 'Proton',
    domain: 'proton.me',
  },
  { keywords: ['strava'], name: 'Strava', domain: 'strava.com' },
  {
    keywords: ['myfitnesspal'],
    name: 'MyFitnessPal',
    domain: 'myfitnesspal.com',
  },
  {
    keywords: ['nytimes', 'new york times'],
    name: 'NY Times',
    domain: 'nytimes.com',
  },
  {
    keywords: ['wsj', 'wall street journal'],
    name: 'Wall Street Journal',
    domain: 'wsj.com',
  },
  {
    keywords: ['washington post', 'washpost'],
    name: 'Washington Post',
    domain: 'washingtonpost.com',
  },
  {
    keywords: ['chatgpt', 'openai'],
    name: 'ChatGPT / OpenAI',
    domain: 'openai.com',
  },
  {
    keywords: ['claude', 'anthropic'],
    name: 'Claude / Anthropic',
    domain: 'anthropic.com',
  },
  { keywords: ['zoom'], name: 'Zoom', domain: 'zoom.us' },
  { keywords: ['dashlane'], name: 'Dashlane', domain: 'dashlane.com' },
  { keywords: ['plex'], name: 'Plex', domain: 'plex.tv' },
  { keywords: ['sling', 'slingtv'], name: 'Sling TV', domain: 'sling.com' },
  { keywords: ['fubo', 'fuboTV'], name: 'FuboTV', domain: 'fubo.tv' },
  {
    keywords: ['directv stream'],
    name: 'DirecTV Stream',
    domain: 'directvstream.com',
  },
  { keywords: ['philo'], name: 'Philo', domain: 'philo.com' },
];

// ─── Service logo component ───────────────────────────────────────────────────
function ServiceLogo({
  domain,
  name,
  size = 28,
}: {
  domain: string;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  function nameToColor(n: string): string {
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
      hash = n.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360}, 50%, 45%)`;
  }

  const initial = name[0]?.toUpperCase() ?? '?';
  const color = nameToColor(name);

  const sharedStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    flexShrink: 0,
  };

  if (domain && !failed) {
    return (
      <img
        src={`/favicon-proxy/${domain}`}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{
          ...sharedStyle,
          objectFit: 'contain',
          background: '#fff',
          padding: 2,
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...sharedStyle,
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.5),
        color: 'white',
        fontWeight: 'bold',
      }}
    >
      {initial}
    </div>
  );
}

// ─── Subscription detection ───────────────────────────────────────────────────
type DetectedSubscription = {
  name: string;
  domain: string;
  payee: string;
  amount: number; // median charge in cents (positive)
  frequency: 'monthly' | 'quarterly' | 'annual' | 'unknown';
  lastCharged: string; // YYYY-MM-DD
  monthlyEquivalent: number; // cents
  charges: number; // count in window
};

function detectSubscriptions(
  transactions: TransactionEntity[],
  accountIds: Set<string>,
  payeeMap: Map<string, string>,
): DetectedSubscription[] {
  // Only on-budget, non-transfer, non-parent expenses
  const expenses = transactions.filter(
    tx =>
      accountIds.has(tx.account) &&
      !tx.is_parent &&
      !tx.transfer_id &&
      tx.amount < 0,
  );

  // Group by payee ID
  const byPayee = new Map<string, typeof expenses>();
  for (const tx of expenses) {
    const key = tx.payee ?? 'unknown';
    if (!byPayee.has(key)) byPayee.set(key, []);
    byPayee.get(key)!.push(tx);
  }

  const results: DetectedSubscription[] = [];

  for (const [payeeId, txs] of byPayee) {
    if (txs.length < 2) continue; // need at least 2 charges to be "recurring"

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map(t => Math.abs(t.amount));
    // Resolve payee name: look up from payee map first, then fall back
    const resolvedName = payeeMap.get(payeeId) ?? '';
    const payeeName = resolvedName.toLowerCase().trim();
    const lastCharged = sorted[sorted.length - 1].date;

    // Match against known services
    const match = KNOWN_SERVICES.find(s =>
      s.keywords.some(kw => payeeName.includes(kw)),
    );

    // For unknown payees: only include if charges are somewhat consistent in amount
    // (within 20% of the median)
    const median = amounts.slice().sort((a, b) => a - b)[
      Math.floor(amounts.length / 2)
    ];
    const consistent = amounts.every(a => Math.abs(a - median) / median < 0.2);

    if (!match && !consistent) continue;
    if (!match && txs.length < 2) continue;

    // Determine frequency from gap between charges
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date).getTime();
      const curr = new Date(sorted[i].date).getTime();
      gaps.push((curr - prev) / (1000 * 60 * 60 * 24)); // days
    }
    const medianGap =
      gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;

    let frequency: DetectedSubscription['frequency'] = 'unknown';
    let monthlyEquivalent = median;

    if (medianGap >= 25 && medianGap <= 40) {
      frequency = 'monthly';
      monthlyEquivalent = median;
    } else if (medianGap >= 80 && medianGap <= 105) {
      frequency = 'quarterly';
      monthlyEquivalent = Math.round(median / 3);
    } else if (medianGap >= 330 && medianGap <= 400) {
      frequency = 'annual';
      monthlyEquivalent = Math.round(median / 12);
    }

    // Skip likely-cancelled subscriptions (last charge too long ago for the cadence)
    const daysSinceLast =
      (Date.now() - new Date(lastCharged).getTime()) / (1000 * 60 * 60 * 24);
    if (frequency === 'monthly' && daysSinceLast > 45) continue;
    if (frequency === 'quarterly' && daysSinceLast > 110) continue;
    if (frequency === 'annual' && daysSinceLast > 400) continue;
    if (frequency === 'unknown' && daysSinceLast > 60) continue;

    results.push({
      name: match?.name ?? (resolvedName || 'Unknown'),
      domain: match?.domain ?? '',
      payee: resolvedName || payeeId,
      amount: median,
      frequency,
      lastCharged,
      monthlyEquivalent,
      charges: txs.length,
    });
  }

  // Sort by monthly cost descending
  return results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDollars(cents: number): string {
  return (
    '$' +
    (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function getDateRange(months = 13) {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getFullYear(), now.getMonth() - months, 1)
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

const DISMISSED_KEY = 'subscriptions-dismissed-payees';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(dismissed: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
}

// ─── Row component ────────────────────────────────────────────────────────────
function SubscriptionRow({
  sub,
  onDismiss,
  dimmed,
}: {
  sub: DetectedSubscription;
  onDismiss: () => void;
  dimmed?: boolean;
}) {
  const { t } = useTranslation();

  const freqLabel =
    sub.frequency === 'monthly'
      ? 'monthly'
      : sub.frequency === 'quarterly'
        ? 'quarterly'
        : sub.frequency === 'annual'
          ? 'annual'
          : 'recurring';

  const chargeLabel =
    sub.frequency === 'annual'
      ? `${formatDollars(sub.amount)}/yr`
      : sub.frequency === 'quarterly'
        ? `${formatDollars(sub.amount)}/qtr`
        : `${formatDollars(sub.amount)}/mo`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: `1px solid ${theme.tableBorder}`,
        gap: 12,
        opacity: dimmed ? 0.45 : 1,
        minHeight: 48,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <ServiceLogo domain={sub.domain} name={sub.name} size={28} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.tableText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sub.name}
        </div>
        <div
          style={{ fontSize: 11, color: theme.tableTextLight, marginTop: 2 }}
        >
          {freqLabel} · last charged {sub.lastCharged}
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.tableText,
          flexShrink: 0,
        }}
      >
        {chargeLabel}
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        title={dimmed ? t('Restore') : t('Remove from list')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: theme.tableTextLight,
          fontSize: 18,
          lineHeight: 1,
          padding: '2px 4px',
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export function SubscriptionsModal() {
  const { t } = useTranslation();

  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>(
    [],
  );
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    loadDismissed(),
  );
  const [showDismissed, setShowDismissed] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [error, setError] = useState('');

  function dismissPayee(payeeKey: string) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(payeeKey);
      saveDismissed(next);
      return next;
    });
  }

  function restorePayee(payeeKey: string) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(payeeKey);
      saveDismissed(next);
      return next;
    });
  }

  useEffect(() => {
    async function load() {
      try {
        const { start, end } = getDateRange(13);

        const [accounts, transactions, payees] = await Promise.all([
          send('accounts-get') as Promise<AccountEntity[]>,
          send('api/transactions-get', {
            startDate: start,
            endDate: end,
          }) as Promise<TransactionEntity[]>,
          send('payees-get') as Promise<PayeeEntity[]>,
        ]);

        const onBudgetIds = new Set(
          accounts
            .filter(a => !a.offbudget && !a.closed && !a.tombstone)
            .map(a => a.id),
        );

        // Build payee ID → name lookup
        const payeeMap = new Map<string, string>(
          payees.map(p => [p.id, p.name]),
        );

        const detected = detectSubscriptions(
          transactions,
          onBudgetIds,
          payeeMap,
        );
        setSubscriptions(detected);
        setStatus('done');
      } catch (e) {
        setError(String(e));
        setStatus('error');
      }
    }

    void load();
  }, []);

  const visibleSubs = subscriptions.filter(s => !dismissed.has(s.payee));
  const hiddenSubs = subscriptions.filter(s => dismissed.has(s.payee));

  const totalMonthly = visibleSubs.reduce(
    (sum, s) => sum + s.monthlyEquivalent,
    0,
  );
  const totalAnnual = totalMonthly * 12;

  const monthly = visibleSubs.filter(s => s.frequency === 'monthly');
  const quarterly = visibleSubs.filter(s => s.frequency === 'quarterly');
  const annual = visibleSubs.filter(s => s.frequency === 'annual');
  const other = visibleSubs.filter(s => s.frequency === 'unknown');

  return (
    <Modal
      name="subscriptions"
      containerProps={{ style: { width: '520px', maxWidth: '95vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Subscriptions')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          {status === 'loading' && (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: theme.tableTextLight }}>
                <Trans>Scanning transactions…</Trans>
              </Text>
            </View>
          )}

          {status === 'error' && (
            <View style={{ padding: 24 }}>
              <Text style={{ color: theme.errorText }}>{error}</Text>
            </View>
          )}

          {status === 'done' && subscriptions.length === 0 && (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: theme.tableTextLight }}>
                {t(
                  'No recurring subscriptions detected in the last 13 months.',
                )}
              </Text>
            </View>
          )}

          {status === 'done' && subscriptions.length > 0 && (
            <>
              {/* Summary bar */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  backgroundColor: theme.tableHeaderBackground,
                  borderBottom: `1px solid ${theme.tableBorder}`,
                }}
              >
                <Text style={{ fontSize: 13, color: theme.tableHeaderText }}>
                  {t('{{count}} tracked', { count: visibleSubs.length })}
                  {hiddenSubs.length > 0 && (
                    <span
                      style={{
                        marginLeft: 8,
                        cursor: 'pointer',
                        color: theme.pageTextLink,
                        fontSize: 12,
                      }}
                      onClick={() => setShowDismissed(v => !v)}
                    >
                      {showDismissed
                        ? t('hide removed')
                        : t('+ {{count}} hidden', { count: hiddenSubs.length })}
                    </span>
                  )}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: theme.tableHeaderText,
                    }}
                  >
                    {formatDollars(totalMonthly)}/mo
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.tableTextLight }}>
                    {formatDollars(totalAnnual)}/yr
                  </Text>
                </View>
              </View>

              {/* Scrollable list */}
              <View style={{ overflowY: 'auto', maxHeight: '60vh' }}>
                {monthly.length > 0 && <SectionHeader label={t('Monthly')} />}
                {monthly.map(sub => (
                  <SubscriptionRow
                    key={sub.payee + sub.name}
                    sub={sub}
                    onDismiss={() => dismissPayee(sub.payee)}
                  />
                ))}

                {quarterly.length > 0 && (
                  <SectionHeader label={t('Quarterly')} />
                )}
                {quarterly.map(sub => (
                  <SubscriptionRow
                    key={sub.payee + sub.name}
                    sub={sub}
                    onDismiss={() => dismissPayee(sub.payee)}
                  />
                ))}

                {annual.length > 0 && <SectionHeader label={t('Annual')} />}
                {annual.map(sub => (
                  <SubscriptionRow
                    key={sub.payee + sub.name}
                    sub={sub}
                    onDismiss={() => dismissPayee(sub.payee)}
                  />
                ))}

                {other.length > 0 && (
                  <View
                    style={{
                      padding: '6px 16px 4px',
                      backgroundColor: theme.tableRowHeaderBackground,
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowOther(v => !v)}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: theme.tableHeaderText,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {t('Other Recurring')} ({other.length})
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.tableTextLight }}>
                      {showOther ? '▲ hide' : '▼ show'}
                    </Text>
                  </View>
                )}
                {showOther &&
                  other.map(sub => (
                    <SubscriptionRow
                      key={sub.payee + sub.name}
                      sub={sub}
                      onDismiss={() => dismissPayee(sub.payee)}
                    />
                  ))}

                {/* Hidden / dismissed items */}
                {showDismissed && hiddenSubs.length > 0 && (
                  <>
                    <SectionHeader label={t('Removed (click × to restore)')} />
                    {hiddenSubs.map(sub => (
                      <SubscriptionRow
                        key={sub.payee + sub.name}
                        sub={sub}
                        dimmed
                        onDismiss={() => restorePayee(sub.payee)}
                      />
                    ))}
                  </>
                )}
              </View>

              <View
                style={{
                  padding: '10px 16px',
                  borderTop: `1px solid ${theme.tableBorder}`,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
              >
                <Button onPress={() => state.close()}>
                  <Trans>Close</Trans>
                </Button>
              </View>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View
      style={{
        padding: '6px 16px 4px',
        backgroundColor: theme.tableRowHeaderBackground,
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.tableHeaderText,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
