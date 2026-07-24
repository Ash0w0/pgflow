import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Check,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  IndianRupee,
  Settings,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";

type ProductionOverviewProps = {
  tenantName: string;
  role: "owner" | "manager" | "accountant";
  data: {
    rooms: {
      floors: number;
      rooms: number;
      beds: number;
      vacantBeds: number;
      maintenanceBeds: number;
    };
    residents: {
      residentLimit: number;
      activeResidents: number;
      noticeResidents: number;
      availableBeds: number;
      totalOutstanding: number;
    };
    collections: {
      periodLabel: string;
      upiConfigured: boolean;
      pendingPayments: number;
      invoiceCount: number;
      totalBilled: number;
      totalCollected: number;
      totalOutstanding: number;
      overdueCount: number;
      readyToGenerateCount: number;
    };
  } | null;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function roleLabel(role: ProductionOverviewProps["role"]) {
  if (role === "accountant") return "Accountant";
  if (role === "manager") return "Manager";
  return "Owner";
}

export function ProductionOverview({ tenantName, role, data }: ProductionOverviewProps) {
  if (!data) {
    return (
      <div className="page-stack production-overview">
        <section className="page-heading">
          <div>
            <div className="eyebrow">Production workspace</div>
            <h1>{tenantName}</h1>
            <p>Complete the first property setup to begin using the live overview.</p>
          </div>
        </section>
        <section className="panel production-overview-empty">
          <span><Settings size={26} /></span>
          <div>
            <h2>Set up the property structure first</h2>
            <p>Add floors, rooms, and beds. PGFlow will use those real records to build the resident and collection workflow.</p>
          </div>
          <Link className="button button-primary" href="/rooms">Open room setup <ArrowRight size={16} /></Link>
        </section>
      </div>
    );
  }

  const collectionRate = data.collections.totalBilled > 0
    ? Math.round((data.collections.totalCollected / data.collections.totalBilled) * 100)
    : 0;
  const metrics = [
    {
      icon: UsersRound,
      label: "Active residents",
      value: String(data.residents.activeResidents),
      detail: `${data.residents.noticeResidents} in notice period`,
      href: "/residents",
    },
    {
      icon: BedDouble,
      label: "Vacant beds",
      value: String(data.rooms.vacantBeds),
      detail: `${data.rooms.beds} beds across ${data.rooms.rooms} rooms`,
      href: "/rooms",
    },
    {
      icon: IndianRupee,
      label: "Outstanding",
      value: currency(data.collections.totalOutstanding),
      detail: `${data.collections.overdueCount} overdue invoices`,
      href: "/collections",
    },
    {
      icon: FileCheck2,
      label: "Payment reviews",
      value: String(data.collections.pendingPayments),
      detail: "Awaiting an authorized review",
      href: "/collections",
    },
  ];

  const attentionItems = [
    {
      show: data.collections.readyToGenerateCount > 0,
      icon: IndianRupee,
      title: `${data.collections.readyToGenerateCount} rent invoice${data.collections.readyToGenerateCount === 1 ? "" : "s"} ready`,
      detail: `Generate ${data.collections.periodLabel} rent only after reviewing the preview.`,
      href: "/collections",
      action: "Review rent",
    },
    {
      show: data.collections.pendingPayments > 0,
      icon: ClipboardCheck,
      title: `${data.collections.pendingPayments} payment proof${data.collections.pendingPayments === 1 ? "" : "s"} awaiting review`,
      detail: "Verify the transfer outside PGFlow before approving the record.",
      href: "/collections",
      action: "Review proofs",
    },
    {
      show: data.rooms.maintenanceBeds > 0,
      icon: CircleAlert,
      title: `${data.rooms.maintenanceBeds} bed${data.rooms.maintenanceBeds === 1 ? "" : "s"} marked for maintenance`,
      detail: "Review room availability before assigning a resident.",
      href: "/rooms",
      action: "Open rooms",
    },
  ].filter((item) => item.show);

  return (
    <div className="page-stack production-overview">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Production workspace · {roleLabel(role)}</div>
          <h1>{tenantName}</h1>
          <p>Live property records for {data.collections.periodLabel}.</p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" href="/residents"><UserRoundPlus size={16} /> Add resident</Link>
          <Link className="button button-primary" href="/collections"><IndianRupee size={16} /> Open collections</Link>
        </div>
      </section>

      <section className="metric-grid" aria-label="Live property metrics">
        {metrics.map(({ icon: Icon, label, value, detail, href }) => (
          <Link className="metric-card production-metric" href={href} key={label}>
            <div className="metric-head">
              <span>{label}</span>
              <span className="metric-icon"><Icon size={18} /></span>
            </div>
            <strong>{value}</strong>
            <p>{detail}</p>
            <small>Open live records <ArrowRight size={13} /></small>
          </Link>
        ))}
      </section>

      <section className="production-overview-grid">
        <article className="panel production-collection-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Collections</span>
              <h2>{data.collections.periodLabel}</h2>
              <p>Calculated from live invoices and approved payment records.</p>
            </div>
            <Link className="text-button" href="/collections">Open register <ArrowRight size={14} /></Link>
          </div>
          <div className="production-collection-total">
            <div>
              <span>Collected</span>
              <strong>{currency(data.collections.totalCollected)}</strong>
            </div>
            <div>
              <span>Billed</span>
              <strong>{currency(data.collections.totalBilled)}</strong>
            </div>
            <span>{collectionRate}%</span>
          </div>
          <div className="production-collection-track" aria-label={`${collectionRate}% of billed rent collected`}>
            <span style={{ width: `${Math.min(100, collectionRate)}%` }} />
          </div>
          <div className="production-collection-foot">
            <span>{data.collections.invoiceCount} live invoices</span>
            <span>{currency(data.collections.totalOutstanding)} outstanding</span>
          </div>
        </article>

        <article className="panel production-setup-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Operating foundation</span>
              <h2>Workspace readiness</h2>
            </div>
          </div>
          <div className="production-readiness-list">
            <Link href="/rooms"><span><Check size={16} /></span><div><strong>Property structure</strong><small>{data.rooms.floors} floors · {data.rooms.rooms} rooms · {data.rooms.beds} beds</small></div><ArrowRight size={15} /></Link>
            <Link href="/residents"><span><Check size={16} /></span><div><strong>Resident register</strong><small>{data.residents.activeResidents} of {data.residents.residentLimit} resident slots active</small></div><ArrowRight size={15} /></Link>
            <Link href="/settings"><span className={data.collections.upiConfigured ? "" : "not-ready"}>{data.collections.upiConfigured ? <Check size={16} /> : <CircleAlert size={16} />}</span><div><strong>Direct UPI settings</strong><small>{data.collections.upiConfigured ? "Configured for payment links" : "Complete UPI setup before sharing payment links"}</small></div><ArrowRight size={15} /></Link>
          </div>
        </article>
      </section>

      <section className="panel production-attention-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Needs attention</span>
            <h2>Next authorized actions</h2>
          </div>
        </div>
        {attentionItems.length > 0 ? (
          <div className="production-attention-list">
            {attentionItems.map(({ icon: Icon, title, detail, href, action }) => (
              <Link href={href} key={title}>
                <span><Icon size={20} /></span>
                <div><strong>{title}</strong><small>{detail}</small></div>
                <b>{action} <ArrowRight size={14} /></b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="production-clear-state">
            <span><Check size={21} /></span>
            <div><strong>No queued review actions</strong><small>New rent, payment-proof, and room-maintenance work will appear here.</small></div>
          </div>
        )}
      </section>
    </div>
  );
}
