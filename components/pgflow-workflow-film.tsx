import type { CSSProperties, ReactNode } from "react";
import {
  BedDouble,
  Building2,
  Check,
  IndianRupee,
  ClipboardCheck,
  FileCheck2,
  Link2,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
} from "remotion";

export const WORKFLOW_FILM_FPS = 30;
export const WORKFLOW_FILM_DURATION = 720;
export const WORKFLOW_FILM_WIDTH = 1600;
export const WORKFLOW_FILM_HEIGHT = 900;

const colors = {
  forest: "#123d32",
  forestDeep: "#082a22",
  forestSoft: "#1b5043",
  lime: "#d7ff86",
  paper: "#f4f7f2",
  white: "#ffffff",
  ink: "#12231f",
  inkSoft: "#53645f",
  line: "#dfe6df",
  success: "#219464",
  warm: "#fff4de",
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

function fade(localFrame: number, duration: number) {
  return interpolate(
    localFrame,
    [0, 20, duration - 20, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut },
  );
}

function rise(localFrame: number, delay = 0) {
  return interpolate(localFrame, [delay, delay + 28], [42, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
}

function scaleIn(localFrame: number, delay = 0) {
  return interpolate(localFrame, [delay, delay + 30], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
}

function FilmCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        border: `1px solid ${colors.line}`,
        borderRadius: 24,
        background: colors.white,
        boxShadow: "0 28px 70px rgba(2, 24, 18, 0.22)",
        color: colors.ink,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SceneHeading({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <header style={{ width: 520, paddingTop: 20 }}>
      <div
        style={{
          color: colors.lime,
          fontSize: 26,
          fontWeight: 720,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <h2
        style={{
          margin: "18px 0 18px",
          color: colors.white,
          fontSize: 64,
          fontWeight: 760,
          letterSpacing: "-0.035em",
          lineHeight: 1.02,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth: 500,
          color: "rgba(255,255,255,0.68)",
          fontSize: 30,
          lineHeight: 1.4,
        }}
      >
        {detail}
      </p>
    </header>
  );
}

function WhatsAppHeader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "22px 24px",
        borderRadius: "22px 22px 0 0",
        color: colors.white,
        background: colors.forest,
      }}
    >
      <div
        style={{
          display: "grid",
          width: 48,
          height: 48,
          placeItems: "center",
          borderRadius: 15,
          color: colors.forestDeep,
          background: colors.lime,
        }}
      >
        <MessageCircle size={28} strokeWidth={2.3} />
      </div>
      <div>
        <strong style={{ display: "block", fontSize: 26 }}>PGFlow on WhatsApp</strong>
        <span style={{ display: "block", marginTop: 2, color: "rgba(255,255,255,.62)", fontSize: 20 }}>
          Verified workflow
        </span>
      </div>
    </div>
  );
}

function RentReminderScene() {
  const frame = useCurrentFrame();
  const duration = 200;
  const opacity = fade(frame, duration);
  const messageProgress = interpolate(frame, [30, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  return (
    <AbsoluteFill
      style={{
        padding: "126px 92px 118px",
        opacity,
        transform: `translateY(${rise(frame)}px)`,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "520px 1fr", alignItems: "center", gap: 82, height: "100%" }}>
        <SceneHeading
          label="Resident"
          title="The rent reminder starts in a familiar place."
          detail="A clear WhatsApp message opens one secure, invoice-specific action."
        />
        <FilmCard
          style={{
            width: 650,
            justifySelf: "end",
            overflow: "hidden",
            transform: `scale(${scaleIn(frame, 8)})`,
          }}
        >
          <WhatsAppHeader />
          <div style={{ minHeight: 430, padding: 30, background: "#eef3e9" }}>
            <div
              style={{
                width: 490,
                padding: 26,
                borderRadius: "8px 22px 22px 22px",
                background: colors.white,
                boxShadow: "0 12px 26px rgba(21, 61, 50, .08)",
                opacity: messageProgress,
                transform: `translateY(${interpolate(messageProgress, [0, 1], [28, 0])}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: colors.inkSoft, fontSize: 21 }}>
                <IndianRupee size={24} />
                May rent · Room 204
              </div>
              <strong style={{ display: "block", marginTop: 16, fontSize: 34 }}>₹8,500 is due on 5 May.</strong>
              <p style={{ margin: "12px 0 22px", color: colors.inkSoft, fontSize: 22, lineHeight: 1.45 }}>
                Open the secure link to view the invoice and payment instructions.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  minHeight: 62,
                  borderRadius: 14,
                  color: colors.forestDeep,
                  background: colors.lime,
                  fontSize: 23,
                  fontWeight: 740,
                }}
              >
                <Link2 size={25} /> View secure payment link
              </div>
            </div>
            <div style={{ marginTop: 24, color: "#6d7c76", fontSize: 19 }}>10:30 AM · Message ready for review</div>
          </div>
        </FilmCard>
      </div>
    </AbsoluteFill>
  );
}

function SecureLinkScene() {
  const frame = useCurrentFrame();
  const duration = 200;
  const opacity = fade(frame, duration);
  const relay = interpolate(frame, [28, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  return (
    <AbsoluteFill
      style={{
        padding: "126px 92px 118px",
        opacity,
        transform: `translateY(${rise(frame)}px)`,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "470px 1fr", alignItems: "center", gap: 76, height: "100%" }}>
        <SceneHeading
          label="Secure link"
          title="The resident gets one focused task."
          detail="They see the invoice, pay directly to the PG, and share proof without entering the owner workspace."
        />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "390px 390px", justifyContent: "end", alignItems: "center", gap: 110 }}>
          <FilmCard style={{ minHeight: 520, padding: 26, transform: `scale(${scaleIn(frame, 5)})` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: colors.inkSoft, fontSize: 18 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={22} /> Secure PGFlow link</span>
              <span>Room 204</span>
            </div>
            <div style={{ marginTop: 40, color: colors.inkSoft, fontSize: 19 }}>May rent</div>
            <strong style={{ display: "block", marginTop: 6, color: colors.forest, fontSize: 50, letterSpacing: "-0.03em" }}>₹8,500</strong>
            <div style={{ display: "grid", gap: 13, marginTop: 30, padding: 20, borderRadius: 16, background: colors.paper, fontSize: 19 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>Pay to</span><strong>Your PG’s UPI</strong></span>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>Due date</span><strong>5 May</strong></span>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>Invoice</span><strong>May rent</strong></span>
            </div>
            <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: 14, color: colors.white, background: colors.forest, fontSize: 21, fontWeight: 720, textAlign: "center" }}>
              View payment instructions
            </div>
          </FilmCard>

          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 405,
              width: 92,
              height: 4,
              borderRadius: 99,
              background: colors.lime,
              transform: `scaleX(${relay})`,
              transformOrigin: "left center",
              boxShadow: "0 0 20px rgba(215,255,134,.55)",
            }}
          />

          <FilmCard
            style={{
              minHeight: 430,
              padding: 28,
              opacity: interpolate(relay, [0.65, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              transform: `translateX(${interpolate(relay, [0, 1], [42, 0])}px)`,
            }}
          >
            <div style={{ display: "grid", width: 62, height: 62, placeItems: "center", borderRadius: 19, color: colors.forest, background: "#e9f7d1" }}>
              <FileCheck2 size={32} />
            </div>
            <div style={{ marginTop: 30, color: colors.inkSoft, fontSize: 20 }}>Payment proof</div>
            <strong style={{ display: "block", marginTop: 8, fontSize: 34 }}>Shared for review</strong>
            <div style={{ marginTop: 24, padding: 20, borderRadius: 16, background: colors.paper }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19 }}>
                <span>Amount shown</span><strong>₹8,500</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, color: colors.inkSoft, fontSize: 18 }}>
                <span>Reference</span><strong>Submitted</strong>
              </div>
            </div>
            <p style={{ margin: "22px 0 0", color: colors.inkSoft, fontSize: 19, lineHeight: 1.45 }}>
              Proof is evidence. It still needs an owner review.
            </p>
          </FilmCard>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function OwnerReviewScene() {
  const frame = useCurrentFrame();
  const duration = 200;
  const opacity = fade(frame, duration);
  const approval = interpolate(frame, [90, 138], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  return (
    <AbsoluteFill
      style={{
        padding: "126px 92px 118px",
        opacity,
        transform: `translateY(${rise(frame)}px)`,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "470px 1fr", alignItems: "center", gap: 74, height: "100%" }}>
        <SceneHeading
          label="Owner"
          title="Money moves only after a human check."
          detail="The owner matches the proof, amount, and reference before PGFlow records the payment and issues a receipt."
        />
        <FilmCard style={{ padding: 30, transform: `scale(${scaleIn(frame, 4)})` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ color: colors.inkSoft, fontSize: 19 }}>Collections · Payment review</span>
              <strong style={{ display: "block", marginTop: 8, fontSize: 34 }}>Review May rent</strong>
            </div>
            <span style={{ padding: "11px 16px", borderRadius: 99, color: "#9a5d15", background: colors.warm, fontSize: 19, fontWeight: 700 }}>
              Awaiting review
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 28 }}>
            {[
              ["Resident", "Room 204"],
              ["Invoice amount", "₹8,500"],
              ["Proof amount", "₹8,500"],
              ["Reference", "Submitted"],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 20, borderRadius: 16, background: colors.paper }}>
                <span style={{ color: colors.inkSoft, fontSize: 18 }}>{label}</span>
                <strong style={{ display: "block", marginTop: 8, fontSize: 24 }}>{value}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 15, marginTop: 25, padding: 19, borderRadius: 16, color: colors.forest, background: "#e8f3ec", fontSize: 19 }}>
            <ShieldCheck size={28} />
            Verify the transfer in your bank or UPI app before approval.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 24 }}>
            <div style={{ display: "grid", minWidth: 150, minHeight: 58, placeItems: "center", border: `1px solid ${colors.line}`, borderRadius: 14, fontSize: 20, fontWeight: 700 }}>Keep pending</div>
            <div
              style={{
                display: "flex",
                minWidth: 210,
                minHeight: 58,
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                borderRadius: 14,
                color: approval > 0.65 ? colors.forestDeep : colors.white,
                background: approval > 0.65 ? colors.lime : colors.forest,
                boxShadow: approval > 0.65 ? "0 12px 34px rgba(215,255,134,.28)" : "none",
                fontSize: 20,
                fontWeight: 740,
              }}
            >
              {approval > 0.65 ? <><Check size={24} /> Payment recorded</> : <><ClipboardCheck size={24} /> Approve payment</>}
            </div>
          </div>
        </FilmCard>
      </div>
    </AbsoluteFill>
  );
}

function ControlRoomScene() {
  const frame = useCurrentFrame();
  const duration = 210;
  const opacity = fade(frame, duration);
  const settle = interpolate(frame, [36, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  const metrics = [
    { icon: BedDouble, label: "Rooms & beds", detail: "See occupancy and availability" },
    { icon: UsersRound, label: "Residents", detail: "Keep every active stay organized" },
    { icon: ReceiptText, label: "Rent records", detail: "Trace proof, approval, and receipts" },
  ];

  return (
    <AbsoluteFill
      style={{
        padding: "126px 92px 118px",
        opacity,
        transform: `translateY(${rise(frame)}px)`,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "430px 1fr", alignItems: "center", gap: 72, height: "100%" }}>
        <SceneHeading
          label="PGFlow"
          title="One conversation becomes a working record."
          detail="Owners manage the whole PG from a calm workspace while residents keep using focused links and WhatsApp."
        />
        <FilmCard style={{ display: "grid", gridTemplateColumns: "190px 1fr", minHeight: 540, overflow: "hidden", transform: `scale(${scaleIn(frame, 2)})` }}>
          <aside style={{ padding: 26, color: colors.white, background: colors.forest }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 780 }}>
              <span style={{ display: "grid", width: 44, height: 44, placeItems: "center", borderRadius: 14, color: colors.forestDeep, background: colors.lime }}>P</span>
              PGFlow
            </div>
            <div style={{ display: "grid", gap: 14, marginTop: 58 }}>
              {["Overview", "Rooms", "Residents", "Collections"].map((item, index) => (
                <div
                  key={item}
                  style={{
                    padding: "14px 15px",
                    borderRadius: 12,
                    color: index === 0 ? colors.forestDeep : "rgba(255,255,255,.66)",
                    background: index === 0 ? colors.lime : "transparent",
                    fontSize: 19,
                    fontWeight: 680,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <div style={{ padding: 30, background: "#f7f9f6" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ color: colors.inkSoft, fontSize: 18 }}>Owner workspace</span>
                <strong style={{ display: "block", marginTop: 6, fontSize: 32 }}>Your PG, in flow</strong>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: colors.success, fontSize: 18, fontWeight: 700 }}>
                <Check size={22} /> Record updated
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 28 }}>
              {metrics.map(({ icon: Icon, label, detail }, index) => (
                <div
                  key={label}
                  style={{
                    minHeight: 160,
                    padding: 19,
                    border: `1px solid ${colors.line}`,
                    borderRadius: 16,
                    background: colors.white,
                    opacity: interpolate(settle, [index * 0.18, index * 0.18 + 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                    transform: `translateY(${interpolate(settle, [index * 0.18, index * 0.18 + 0.45], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
                  }}
                >
                  <Icon size={28} color={colors.forest} />
                  <strong style={{ display: "block", marginTop: 18, fontSize: 21 }}>{label}</strong>
                  <span style={{ display: "block", marginTop: 8, color: colors.inkSoft, fontSize: 17, lineHeight: 1.35 }}>{detail}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 20, marginTop: 17, padding: 22, borderRadius: 16, color: colors.white, background: colors.forestDeep }}>
              <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                <ReceiptText size={30} color={colors.lime} />
                <div>
                  <strong style={{ display: "block", fontSize: 21 }}>May rent receipt issued</strong>
                  <span style={{ display: "block", marginTop: 5, color: "rgba(255,255,255,.6)", fontSize: 17 }}>Payment review · Room 204 · audit event saved</span>
                </div>
              </div>
              <span style={{ padding: "10px 14px", borderRadius: 99, color: colors.forestDeep, background: colors.lime, fontSize: 17, fontWeight: 740 }}>Complete</span>
            </div>
          </div>
        </FilmCard>
      </div>
    </AbsoluteFill>
  );
}

export function PGFlowWorkflowFilm() {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, WORKFLOW_FILM_DURATION - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        color: colors.white,
        background: `radial-gradient(circle at 78% 15%, rgba(215,255,134,.11), transparent 31%), linear-gradient(145deg, ${colors.forest}, ${colors.forestDeep})`,
        fontFamily: "Geist, Inter, Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 50, right: 82, left: 82, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, fontSize: 26, fontWeight: 760 }}>
          <span style={{ display: "grid", width: 42, height: 42, placeItems: "center", borderRadius: 13, color: colors.forestDeep, background: colors.lime }}>P</span>
          PGFlow
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,.58)", fontSize: 19 }}>
          <Building2 size={21} /> Product workflow
        </span>
      </div>

      <Sequence from={0} durationInFrames={200} premountFor={30}>
        <RentReminderScene />
      </Sequence>
      <Sequence from={170} durationInFrames={200} premountFor={30}>
        <SecureLinkScene />
      </Sequence>
      <Sequence from={340} durationInFrames={200} premountFor={30}>
        <OwnerReviewScene />
      </Sequence>
      <Sequence from={510} durationInFrames={210} premountFor={30}>
        <ControlRoomScene />
      </Sequence>

      <div style={{ position: "absolute", right: 82, bottom: 68, left: 82, zIndex: 30 }}>
        <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 99, background: colors.lime }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, color: "rgba(255,255,255,.48)", fontSize: 16 }}>
          <span>Resident</span>
          <span>Secure link</span>
          <span>Owner review</span>
          <span>System of record</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
