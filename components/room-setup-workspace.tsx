"use client";

import { useRouter } from "next/navigation";
import {
  BedDouble,
  Building2,
  CheckCircle2,
  CircleAlert,
  DoorOpen,
  IndianRupee,
  Plus,
  ShieldCheck,
  Sparkles,
  X, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { floorChoices } from "@/lib/floor-presets";
import type { RoomSetupData } from "@/lib/room-setup-types";
import { AppShell } from "./app-shell";
import { WheelPicker } from "./wheel-picker";

type Dialog = "room" | null;

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roomTypeLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function RoomSetupWorkspace({ data, demoMode }: { data: RoomSetupData; demoMode: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [floorKey, setFloorKey] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [capacity, setCapacity] = useState("2");
  const [defaultRent, setDefaultRent] = useState("");
  const [roomState, setRoomState] = useState("active");

  const occupiedBeds = data.totals.beds - data.totals.vacantBeds - data.totals.maintenanceBeds;
  // Every level from the basement to the terrace is on offer; one the PG does
  // not have yet is created when its first room is saved.
  const floors = useMemo(
    () => floorChoices(data.floors.map((floor) => ({ id: floor.id, name: floor.name, sortOrder: floor.sortOrder, roomCount: floor.rooms.length }))),
    [data.floors],
  );
  const selectedFloor = floors.find((floor) => floor.key === floorKey)
    // Start on the highest floor that already has rooms, or the ground floor of a new PG.
    ?? [...floors].reverse().find((floor) => floor.floorId)
    ?? floors.find((floor) => floor.name === "Ground Floor")
    ?? floors[0];

  useEffect(() => {
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setDialog(null);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [dialog]);

  function openDialog(nextDialog: Exclude<Dialog, null>) {
    setError(null);
    setSuccess(null);
    setDialog(nextDialog);
  }

  function closeDialog() {
    if (submitting) return;
    setDialog(null);
    setError(null);
  }

  async function submit(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms/setup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === "string"
          ? result.error
          : "The property setup could not be saved.");
      }
      return true;
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The property setup could not be saved.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await submit({
      action: "create_room",
      ...(selectedFloor.floorId
        ? { floorId: selectedFloor.floorId }
        : { floor: { name: selectedFloor.name, sortOrder: selectedFloor.sortOrder } }),
      code: roomCode,
      roomType,
      capacity: Number(capacity),
      defaultRent: Number(defaultRent),
      state: roomState,
      confirmBedCreation: true,
    });
    if (!created) return;
    const createdCapacity = capacity;
    setRoomCode("");
    setDefaultRent("");
    setDialog(null);
    setSuccess(`Room created on ${selectedFloor.name} with ${createdCapacity} ${Number(createdCapacity) === 1 ? "bed" : "beds"}.`);
    router.refresh();
  }

  return (
    <AppShell demoMode={demoMode}>
      <div className="page-stack room-setup-page">
        <section className="page-heading room-setup-heading">
          <div>
            <div className="demo-kicker"><Sparkles size={14} /> Property setup</div>
            <h1>Rooms &amp; beds</h1>
            <p>Build the floor-to-bed structure once. Residents, rent and occupancy will connect to it next.</p>
          </div>
          <div className="room-heading-actions">
            <a className="button button-secondary" href="/import">
              <Upload size={17} /> Bulk import
            </a>
            <button className="button button-primary" type="button" onClick={() => openDialog("room")}>
              <Plus size={17} /> Add room
            </button>
          </div>
        </section>

        <div className="setup-safety-strip">
          <ShieldCheck size={17} />
          <span><strong>Organization isolated.</strong> All records are scoped to this property and audited.</span>
        </div>

        {success && <div className="setup-feedback success" role="status"><CheckCircle2 size={17} />{success}</div>}

        <section className="workspace-stat-grid" aria-label="Room setup summary">
          <article className="metric-card"><span className="eyebrow">Floors</span><strong>{data.totals.floors}</strong><p>Ordered property levels</p></article>
          <article className="metric-card"><span className="eyebrow">Rooms</span><strong>{data.totals.rooms}</strong><p>Configured rent units</p></article>
          <article className="metric-card"><span className="eyebrow">Beds</span><strong>{data.totals.beds}</strong><p>{data.totals.vacantBeds} currently vacant</p></article>
          <article className="metric-card"><span className="eyebrow">Blocked</span><strong>{data.totals.maintenanceBeds}</strong><p>{occupiedBeds} occupied or reserved</p></article>
        </section>

        {data.floors.length === 0 ? (
          <section className="panel room-empty-state">
            <span className="room-empty-icon"><Building2 size={28} /></span>
            <span className="eyebrow">Start your property map</span>
            <h2>Add your first room</h2>
            <p>Pick its floor, give it a room number and say how many beds it has. The floor and the beds are created for you.</p>
            <button className="button button-primary" type="button" onClick={() => openDialog("room")}>
              <Plus size={17} /> Add first room
            </button>
          </section>
        ) : (
          <section className="floor-stack" aria-label="Property floors">
            {data.floors.map((floor) => {
              const floorBeds = floor.rooms.flatMap((room) => room.beds);
              return (
                <article className="panel floor-card" key={floor.id}>
                  <header className="floor-card-head">
                    <div className="floor-title">
                      <span className="floor-order">{String(floor.sortOrder + 1).padStart(2, "0")}</span>
                      <div><span className="eyebrow">Floor</span><h2>{floor.name}</h2></div>
                    </div>
                    <div className="floor-summary">
                      <span><strong>{floor.rooms.length}</strong> rooms</span>
                      <span><strong>{floorBeds.length}</strong> beds</span>
                      <button className="text-button" type="button" onClick={() => { setFloorKey(floor.id); openDialog("room"); }}>
                        <Plus size={15} /> Add room
                      </button>
                    </div>
                  </header>

                  {floor.rooms.length === 0 ? (
                    <div className="floor-empty">
                      <DoorOpen size={22} />
                      <div><strong>No rooms on this floor</strong><span>Add the first room and its beds together.</span></div>
                    </div>
                  ) : (
                    <div className="room-card-grid">
                      {floor.rooms.map((room) => (
                        <section className="room-card" key={room.id}>
                          <div className="room-card-top">
                            <span className="room-icon"><DoorOpen size={19} /></span>
                            <div><span className="eyebrow">{roomTypeLabel(room.roomType)} room</span><h3>{room.code}</h3></div>
                            <span className={`room-state ${room.state}`}>{room.state === "maintenance" ? "Maintenance" : "Active"}</span>
                          </div>
                          <div className="room-card-meta">
                            <span><BedDouble size={15} /> {room.capacity} {room.capacity === 1 ? "bed" : "beds"}</span>
                            <span><IndianRupee size={15} /> {currency.format(room.defaultRent)} / month</span>
                          </div>
                          <div className="bed-chip-list" aria-label={`${room.code} beds`}>
                            {room.beds.map((bed) => (
                              <span className={`bed-chip ${bed.state}`} key={bed.id}>
                                <span />{bed.label}
                              </span>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {dialog && (
        <div className="setup-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
          <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-dialog-title">
            <header>
              <div>
                <span className="eyebrow">Property structure</span>
                <h2 id="setup-dialog-title">Add a room and beds</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeDialog} aria-label="Close setup form" disabled={submitting}><X size={19} /></button>
            </header>

              <form className="setup-form" onSubmit={createRoom}>
                <div className="setup-form-grid">
                  <div className="setup-floor-field">
                    <span id="room-floor-label">Floor</span>
                    <WheelPicker
                      label="Floor"
                      value={selectedFloor.key}
                      onChange={setFloorKey}
                      disabled={submitting}
                      options={floors.map((floor) => ({
                        key: floor.key,
                        label: floor.name,
                        hint: floor.floorId ? `${floor.roomCount} ${floor.roomCount === 1 ? "room" : "rooms"}` : undefined,
                      }))}
                    />
                    <small>{selectedFloor.floorId ? `This room joins ${selectedFloor.name}.` : `${selectedFloor.name} will be added to your PG with this room.`}</small>
                  </div>
                  <label>Room code<input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} maxLength={20} placeholder="e.g. A-101" required disabled={submitting} /></label>
                  <label>Room type<select value={roomType} onChange={(event) => setRoomType(event.target.value)} disabled={submitting}><option value="single">Single</option><option value="double">Double</option><option value="triple">Triple</option><option value="shared">Shared</option></select></label>
                  <label>Number of beds<input type="number" min="1" max="20" value={capacity} onChange={(event) => setCapacity(event.target.value)} required disabled={submitting} /></label>
                  <label>Default monthly rent<input type="number" inputMode="numeric" min="0" max="10000000" value={defaultRent} onChange={(event) => setDefaultRent(event.target.value)} placeholder="e.g. 8500" required disabled={submitting} /></label>
                  <label>Room status<select value={roomState} onChange={(event) => setRoomState(event.target.value)} disabled={submitting}><option value="active">Active</option><option value="maintenance">Maintenance</option></select></label>
                </div>
                <div className="bed-creation-preview"><BedDouble size={18} /><span><strong>{Number(capacity) || 0} beds will be created automatically.</strong><small>{roomState === "maintenance" ? "Every bed will start in maintenance." : "Every bed will start as vacant."}</small></span></div>
                {error && <p className="setup-form-error" role="alert"><CircleAlert size={16} />{error}</p>}
                <button className="button button-primary button-full" type="submit" disabled={submitting}>{submitting ? "Creating room and beds…" : "Create room and beds"}</button>
              </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
